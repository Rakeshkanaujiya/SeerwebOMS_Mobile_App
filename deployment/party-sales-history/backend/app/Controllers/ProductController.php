<?php

namespace App\Controllers;

use CodeIgniter\RESTful\ResourceController;
use CodeIgniter\API\ResponseTrait;
use App\Models\ProductModel;
use App\Services\TallyProductNormalizer;
use App\Services\TallyApiAuthenticator;
use App\Services\TallyAuthContext;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class ProductController extends ResourceController
{
    use ResponseTrait;

    private const DELIVERED_PRODUCT_DELETE_MESSAGE = 'Cannot delete: Product is used in a delivered order.';
    private const DUPLICATE_DESIGN_NUMBER_MESSAGE = 'A product with this Design Number already exists.';
    private const BUSINESS_TYPE_DAIRY = 3;
    private const DAIRY_CATEGORIES = [
        'Cow Milk', 'Buffalo Milk', 'Curd', 'Paneer', 'Cream', 'Khoa',
        'Buttermilk', 'Ghee', 'Lassi', 'Shrikhand', 'Mishti Doi',
    ];
    private const DAIRY_PACKAGING = ['Bottle', 'Pouch', 'Carton', 'Cup', 'Cone', 'Tub', 'Box', 'Packet'];
    private const DAIRY_TYPES = ['Cow', 'Buffalo', 'A2', 'Organic', 'Full Cream', 'Toned', 'Double Toned', 'Skimmed'];
    private const DAIRY_FLAVORS = ['Plain', 'Vanilla', 'Chocolate', 'Strawberry', 'Mango', 'Rose', 'Elaichi', 'Butterscotch'];
    private const DAIRY_STORAGE_VARIANTS = ['Frozen', 'Chilled', 'Normal'];
    private const DAIRY_STORAGE_TYPES = ['Frozen', 'Chilled', 'Normal Temperature'];

    // ─────────────────────────────────────────────────────────────────────────
    // SERVER LAYOUT (oms.seerweberp.com — cPanel shared hosting)
    //
    //   Domain web root:  oms.seerweberp.com/          (actual public_html)
    //   CodeIgniter root: oms.seerweberp.com/backend/
    //   CI public folder: oms.seerweberp.com/backend/public/   (FCPATH)
    //
    //   Files saved to:   FCPATH . uploads/{slug}/file.jpg
    //   = backend/public/uploads/{slug}/file.jpg
    //
    //   DB stores:        "uploads/{slug}/file.jpg"
    //
    //   Browser URL:      https://oms.seerweberp.com/backend/public/uploads/{slug}/file.jpg
    //   (frontend adds /backend/public/ prefix via imageUrl.ts)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Convert dealer company_name to a URL-safe folder slug.
     * "Exalogic Consulting" → "exalogic-consulting"
     * (empty)              → "dealer-12027"
     */
    private function getDealerSlug(string $dealerId): string
    {
        $db   = \Config\Database::connect();
        $user = $db->table('users')
                   ->select('company_name')
                   ->where('id', (int)$dealerId)
                   ->get()
                   ->getRowArray();

        $companyName = trim($user['company_name'] ?? '');

        if ($companyName === '') {
            return 'dealer-' . $dealerId;
        }

        $slug = strtolower($companyName);
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
        return trim($slug, '-');
    }

    /**
     * Save uploaded image to FCPATH/uploads/{company-slug}/filename.ext
     *
     * FCPATH = path to backend/public/ directory.
     * Files saved here are accessible at:
     *   https://oms.seerweberp.com/backend/public/uploads/{slug}/filename.ext
     *
     * Returns DB-stored relative path: "uploads/{slug}/filename.ext"
     * Returns "" if no valid file provided.
     */
    private function uploadImage($image, string $dealerId): string
    {
        if (!$image || !$image->isValid() || $image->hasMoved()) {
            return '';
        }

        $slug    = $this->getDealerSlug($dealerId);

        // FCPATH = absolute path to backend/public/
        $destDir = FCPATH . 'uploads/' . $slug;

        if (!is_dir($destDir)) {
            mkdir($destDir, 0755, true);
        }

        $newName = $image->getRandomName();
        $image->move($destDir, $newName);

        // Store only the relative portion — frontend prepends /backend/public/
        return 'uploads/' . $slug . '/' . $newName;
    }

    /**
     * Save multiple uploaded images to the dealer folder and return relative paths.
     */
    private function uploadGalleryImages(array $images, string $dealerId): array
    {
        $paths = [];
        foreach ($images as $image) {
            $path = $this->uploadImage($image, $dealerId);
            if ($path !== '') {
                $paths[] = $path;
            }
        }
        return array_values(array_unique($paths));
    }

    private function normalizeGalleryFiles($files): array
    {
        if (!$files) {
            return [];
        }

        if (is_array($files)) {
            return array_values(array_filter($files));
        }

        return [$files];
    }

    /**
     * Validate locally stored upload paths without rejecting external/data URLs.
     * Older rows may include a public-entry prefix even though files live under
     * FCPATH; normalize those prefixes before checking the actual file.
     */
    private function storedImageExists($path): bool
    {
        $value = trim((string)$path);
        if ($value === '') {
            return false;
        }
        if (preg_match('#^(?:https?:|data:|blob:)#i', $value)) {
            return true;
        }

        $relative = ltrim(str_replace('\\', '/', $value), '/');
        $relative = preg_replace('#^(?:api/|backend/public/|public/)#i', '', $relative);
        if (!str_starts_with(strtolower($relative), 'uploads/')) {
            return true;
        }

        return is_file(FCPATH . str_replace('/', DIRECTORY_SEPARATOR, $relative));
    }

    private function prepareColorVariants(
        array $attributes,
        string $dealerId,
        array $existingAttributes = []
    ): array {
        $rows = $attributes['color_variants'] ?? [];
        if (!is_array($rows)) {
            $attributes['color_variants'] = [];
            return $attributes;
        }

        $existingRows = $existingAttributes['color_variants'] ?? [];
        if (!is_array($existingRows)) {
            $existingRows = [];
        }

        $prepared = [];
        foreach (array_values($rows) as $index => $row) {
            if (!is_array($row)) continue;

            $color = trim((string)($row['color'] ?? ''));
            if ($color === '') continue;

            $rowId = trim((string)($row['id'] ?? ''));
            $existingMatch = null;
            foreach ($existingRows as $existingIndex => $existingRow) {
                if (!is_array($existingRow)) continue;

                $existingId = trim((string)($existingRow['id'] ?? ''));
                $sameId = $rowId !== '' && $existingId !== '' && $existingId === $rowId;
                $sameIndexAndColor =
                    $existingIndex === $index &&
                    strcasecmp(trim((string)($existingRow['color'] ?? '')), $color) === 0;
                $sameLegacyColor =
                    $rowId === '' &&
                    $existingId === '' &&
                    strcasecmp(trim((string)($existingRow['color'] ?? '')), $color) === 0;

                if ($sameId || $sameIndexAndColor || $sameLegacyColor) {
                    $existingMatch = $existingRow;
                    break;
                }
            }

            $imagePath = trim((string)($row['image'] ?? ($existingMatch['image'] ?? '')));
            $uploadedImage = $this->uploadImage(
                $this->request->getFile('color_variant_image_' . $index),
                $dealerId
            );
            if ($uploadedImage !== '') {
                $imagePath = $uploadedImage;
            }

            $prepared[] = [
                'id'            => $rowId !== '' ? $rowId : uniqid('color_', true),
                'color'         => $color,
                'hex'           => trim((string)($row['hex'] ?? ($existingMatch['hex'] ?? ''))),
                'option_label'  => trim((string)($row['option_label'] ?? ($existingMatch['option_label'] ?? ''))),
                'image'         => $imagePath,
                'sku'           => trim((string)($row['sku'] ?? '')),
                'design_number' => trim((string)($row['design_number'] ?? '')),
            ];
        }

        $attributes['color_variants'] = $prepared;
        if (!empty($prepared)) {
            $attributes['available_colors'] = array_values(
                array_map(static fn($variant) => $variant['color'], $prepared)
            );
        }

        return $attributes;
    }

    // ── GET /products?dealerid=X ──────────────────────────────────────────────
    private function normalizeSizeSets($raw): array
    {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $rows = is_array($decoded) ? $decoded : [];
        } elseif (is_array($raw)) {
            $rows = $raw;
        } else {
            $rows = [];
        }

        $prepared = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $name = trim((string)($row['name'] ?? ''));
            $sizesRaw = $row['sizes'] ?? [];
            $sizes = is_array($sizesRaw)
                ? array_values(array_unique(array_filter(array_map(static fn($size) => trim((string)$size), $sizesRaw))))
                : [];

            if ($name === '' || empty($sizes)) {
                continue;
            }

            $prepared[] = [
                'id'            => trim((string)($row['id'] ?? '')),
                'name'          => $name,
                'sizeSystemKey' => trim((string)($row['sizeSystemKey'] ?? ($row['size_system_key'] ?? ''))),
                'sizes'         => $sizes,
            ];
        }

        return $prepared;
    }

    private function productsHaveSizeSetsColumn($db): bool
    {
        return $db->fieldExists('size_sets', 'products');
    }

    private function productsHaveShowInCreateOrderColumn($db): bool
    {
        return $db->fieldExists('show_in_create_order', 'products');
    }

    private function ensureProductsHaveShowInCreateOrderColumn($db): bool
    {
        if ($this->productsHaveShowInCreateOrderColumn($db)) {
            return true;
        }

        log_message(
            'warning',
            'products.show_in_create_order column missing; attempting to add it before catalog visibility update.'
        );

        try {
            $db->query(
                'ALTER TABLE products ADD COLUMN show_in_create_order TINYINT(1) NOT NULL DEFAULT 0 AFTER stock'
            );
        } catch (\Throwable $exception) {
            log_message(
                'error',
                'Failed to add products.show_in_create_order column: {message}',
                ['message' => $exception->getMessage()]
            );

            return false;
        }

        return $this->productsHaveShowInCreateOrderColumn($db);
    }

    private function productsHaveDesignNumberColumn($db): bool
    {
        return $db->fieldExists('design_number', 'products');
    }

    private function normalizeDesignNumber($value): string
    {
        return strtoupper(trim((string)$value));
    }

    private function extractDesignNumber(array $attributes, $fallback = ''): string
    {
        foreach (['design_number', 'designNumber', 'design', 'model'] as $key) {
            if (array_key_exists($key, $attributes) && trim((string)$attributes[$key]) !== '') {
                return $this->normalizeDesignNumber($attributes[$key]);
            }
        }

        return $this->normalizeDesignNumber($fallback);
    }

    private function duplicateDesignNumberResponse()
    {
        return $this->response
            ->setStatusCode(409)
            ->setJSON(['success' => false, 'message' => self::DUPLICATE_DESIGN_NUMBER_MESSAGE]);
    }

    private function isDuplicateDesignNumberDbError($db, ?\Throwable $exception = null): bool
    {
        if ($exception) {
            $message = $exception->getMessage();
            if (stripos($message, 'Duplicate entry') !== false || stripos($message, '1062') !== false) {
                return true;
            }
        }

        $error = $db->error();
        return (int)($error['code'] ?? 0) === 1062
            || stripos((string)($error['message'] ?? ''), 'Duplicate entry') !== false;
    }

    private function isDesignNumberAlreadyUsed($db, $dealerId, string $designNumber, $excludeProductId = null): bool
    {
        $designNumber = $this->normalizeDesignNumber($designNumber);
        if ($designNumber === '') {
            return false;
        }

        $builder = $db->table('products')
            ->where('CAST(dealerid AS CHAR)', (string)$dealerId);

        if ($excludeProductId !== null) {
            $builder->where('id !=', (int)$excludeProductId);
        }

        $builder->groupStart()
            ->where('UPPER(TRIM(model))', $designNumber);

        if ($this->productsHaveDesignNumberColumn($db)) {
            $builder->orWhere('UPPER(TRIM(design_number))', $designNumber);
        }

        $builder->orWhere(
            "UPPER(TRIM(CASE WHEN JSON_VALID(attributes) THEN JSON_UNQUOTE(JSON_EXTRACT(attributes, '$.design_number')) ELSE NULL END)) = " . $db->escape($designNumber),
            null,
            false
        );

        $builder->groupEnd();

        return $builder->limit(1)->countAllResults() > 0;
    }

    private function isProductUsedInDeliveredOrder($db, int $productId): bool
    {
        return $db->table('order_items oi')
            ->join('orders o', 'o.id = oi.order_id')
            ->where('oi.product_id', $productId)
            ->where('o.status', 'delivered')
            ->limit(1)
            ->countAllResults() > 0;
    }

    private function currentActor($db): ?array
    {
        $authHeader = $this->request->getHeaderLine('Authorization');
        if (!$authHeader || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
            return null;
        }

        $secret = (string) (env('JWT_SECRET') ?: ($_ENV['JWT_SECRET'] ?? getenv('JWT_SECRET') ?: ''));
        if ($secret === '') {
            return null;
        }

        try {
            $decoded = JWT::decode($matches[1], new Key($secret, 'HS256'));
            $userId = $decoded->id ?? null;
            if (!$userId) {
                return null;
            }

            return $db->table('users')->where('id', (int)$userId)->get()->getRowArray();
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function authorizeProductMutation($db, $dealerId = null)
    {
        $actor = $this->currentActor($db);
        if (!$actor) {
            return $this->failUnauthorized('Unauthorized');
        }

        if (($actor['role'] ?? '') === 'dealer') {
            if ($dealerId !== null && $dealerId !== '' && (string)($actor['id'] ?? '') !== (string)$dealerId) {
                return $this->failForbidden('You cannot manage products for this dealer');
            }
            return true;
        }

        if (($actor['role'] ?? '') !== 'staff') {
            return $this->failForbidden('You do not have permission to manage products');
        }

        if (!$db->fieldExists('can_create_products', 'users') || (int)($actor['can_create_products'] ?? 0) !== 1) {
            return $this->failForbidden('You do not have permission to create or edit products');
        }

        if ($dealerId !== null && (string)($actor['dealer_id'] ?? '') !== (string)$dealerId) {
            return $this->failForbidden('You cannot manage products for this dealer');
        }

        return true;
    }

    private function sumVariantStock(array $variants): int
    {
        $total = 0;
        foreach ($variants as $variant) {
            if (!is_array($variant)) {
                continue;
            }
            $total += max(0, (int)($variant['qty'] ?? 0));
        }
        return $total;
    }

    private function variantHasAnyValue($variant): bool
    {
        if (!is_array($variant)) {
            return false;
        }

        foreach (['size', 'qty', 'mrp', 'rate', 'rack', 'color'] as $field) {
            if (array_key_exists($field, $variant) && trim((string)($variant[$field] ?? '')) !== '') {
                return true;
            }
        }

        return false;
    }

    private function resolveVariantBasePrice(array $variants, float $fallback = 0): float
    {
        foreach ($variants as $variant) {
            if (!is_array($variant)) {
                continue;
            }

            $rate = (float)($variant['rate'] ?? 0);
            if ($rate > 0) {
                return $rate;
            }

            $mrp = (float)($variant['mrp'] ?? 0);
            if ($mrp > 0) {
                return $mrp;
            }
        }

        return $fallback;
    }

    private function productSizeRange(array $variants, array $sizeSets = [], array $attributes = []): string
    {
        $sizes = [];

        foreach ($variants as $variant) {
            if (!is_array($variant)) {
                continue;
            }
            $size = trim((string)($variant['size'] ?? ''));
            if ($size !== '') {
                $sizes[] = $size;
            }
        }

        if (empty($sizes)) {
            foreach ($sizeSets as $sizeSet) {
                $setSizes = is_array($sizeSet) ? ($sizeSet['sizes'] ?? []) : [];
                if (!is_array($setSizes)) {
                    continue;
                }
                foreach ($setSizes as $size) {
                    $size = trim((string)$size);
                    if ($size !== '') {
                        $sizes[] = $size;
                    }
                }
            }
        }

        if (empty($sizes)) {
            $rawSize = $attributes['size'] ?? ($attributes['sizes'] ?? '');
            if (is_array($rawSize)) {
                $sizes = array_values(array_filter(array_map(static fn($size) => trim((string)$size), $rawSize)));
            } else {
                $sizes = array_values(array_filter(array_map('trim', preg_split('/[,|]+/', (string)$rawSize) ?: [])));
            }
        }

        $unique = [];
        foreach ($sizes as $size) {
            $normalized = strtoupper(trim((string)$size));
            if ($normalized === '' || isset($unique[$normalized])) {
                continue;
            }
            $unique[$normalized] = trim((string)$size);
        }

        $sizes = array_values($unique);
        if (count($sizes) === 0) {
            return '';
        }
        if (count($sizes) === 1) {
            return $sizes[0];
        }

        $alphaOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL'];
        for ($index = 2; $index <= 20; $index++) {
            $alphaOrder[] = $index . 'XL';
        }
        $alphaIndex = array_flip($alphaOrder);
        $normalizedSizes = array_map(static fn($size) => strtoupper(trim((string)$size)), $sizes);

        if (count(array_filter($normalizedSizes, static fn($size) => isset($alphaIndex[$size]))) === count($sizes)) {
            usort($sizes, static function ($left, $right) use ($alphaIndex) {
                return $alphaIndex[strtoupper($left)] <=> $alphaIndex[strtoupper($right)];
            });
        } elseif (count(array_filter($sizes, static fn($size) => preg_match('/^\d+(?:\.\d+)?$/', trim((string)$size)))) === count($sizes)) {
            usort($sizes, static fn($left, $right) => (float)$left <=> (float)$right);
        } else {
            usort($sizes, static fn($left, $right) => strnatcasecmp((string)$left, (string)$right));
        }

        return $sizes[0] . '–' . $sizes[count($sizes) - 1];
    }

    private function hydrateProduct(array $p, $db): array
    {
        $p['show_in_create_order'] = (int)($p['show_in_create_order'] ?? 0);

        if (!empty($p['attributes']) && is_string($p['attributes'])) {
            $decoded = json_decode($p['attributes'], true);
            $p['attributes'] = json_last_error() === JSON_ERROR_NONE ? $decoded : [];
        } else {
            $p['attributes'] = $p['attributes'] ?? [];
        }

        // Do not send known-missing local uploads to image tags. Preserve the
        // database value until the product is edited, but expose the first
        // existing color/gallery image as the product fallback.
        $colorVariants = $p['attributes']['color_variants'] ?? [];
        if (is_array($colorVariants)) {
            foreach ($colorVariants as &$colorVariant) {
                if (is_array($colorVariant) && !$this->storedImageExists($colorVariant['image'] ?? '')) {
                    $colorVariant['image'] = '';
                }
            }
            unset($colorVariant);
            $p['attributes']['color_variants'] = $colorVariants;
        }

        $galleryImages = $p['attributes']['gallery_images'] ?? [];
        $galleryImages = is_array($galleryImages)
            ? array_values(array_filter($galleryImages, fn($path) => $this->storedImageExists($path)))
            : [];
        if (array_key_exists('gallery_images', $p['attributes'])) {
            $p['attributes']['gallery_images'] = $galleryImages;
        }

        if (!$this->storedImageExists($p['image'] ?? '')) {
            $p['image'] = '';
            foreach ($colorVariants as $colorVariant) {
                if (!empty($colorVariant['image'])) {
                    $p['image'] = $colorVariant['image'];
                    break;
                }
            }
            if ($p['image'] === '' && !empty($galleryImages)) {
                $p['image'] = $galleryImages[0];
            }
        }

        $sizeSets = [];
        if (!empty($p['size_sets'])) {
            $decodedSizeSets = is_string($p['size_sets']) ? json_decode($p['size_sets'], true) : $p['size_sets'];
            if (is_array($decodedSizeSets)) {
                $sizeSets = $this->normalizeSizeSets($decodedSizeSets);
            }
        }
        if (empty($sizeSets) && !empty($p['attributes']['selected_size_sets'])) {
            $sizeSets = $this->normalizeSizeSets($p['attributes']['selected_size_sets']);
        }
        $p['size_sets'] = $sizeSets;
        $p['attributes']['selected_size_sets'] = $sizeSets;

        if (empty($p['brand']) && !empty($p['attributes']['brand']))
            $p['brand'] = $p['attributes']['brand'];
        if (empty($p['model']) && !empty($p['attributes']['model']))
            $p['model'] = $p['attributes']['model'];
        if (empty($p['color']) && !empty($p['attributes']['color']))
            $p['color'] = $p['attributes']['color'];

        $variants = $db->table('product_variants')
            ->where('product_id', (int)$p['id'])
            ->orderBy('id', 'ASC')
            ->get()->getResultArray();

        $p['variants'] = array_map(function ($v) {
            return [
                'id'         => (int)$v['id'],
                'product_id' => (int)$v['product_id'],
                'size'       => $v['size']  ?? '',
                'color'      => $v['color'] ?? '',
                'qty'        => (int)$v['qty'],
                'mrp'        => (float)$v['mrp'],
                'rate'       => (float)$v['rate'],
                'amount'     => isset($v['amount']) ? (float)$v['amount'] : (float)$v['qty'] * (float)$v['rate'],
                'rack'       => $v['rack']  ?? '',
            ];
        }, $variants);

        $p['size_range'] = $this->productSizeRange($variants, $sizeSets, $p['attributes']);
        $p['attributes']['size_range'] = $p['size_range'];

        return $p;
    }

    public function index()
    {
        $dealerId = $this->request->getGet('dealerid');
        if (!$dealerId) return $this->respond([]);

        $db = \Config\Database::connect();

        $builder = $db->table('products p')
            ->select('p.*')
            ->where('CAST(p.dealerid AS CHAR)', (string)$dealerId)
            ->where('p.price >=', 0)
            ->orderBy('p.id', 'DESC');
        if ($db->fieldExists('tally_active', 'products')) $builder->where('p.tally_active', 1);

        if (
            $this->request->getGet('create_order') === '1' &&
            $this->productsHaveShowInCreateOrderColumn($db)
        ) {
            $builder->where('p.show_in_create_order', 1);
        }

        $products = $builder->get()->getResultArray();

        // Personalize the Create Order catalog using the authenticated user's
        // own persisted order history. Total quantity is the primary signal;
        // distinct order count breaks ties between equally ordered products.
        if ($this->request->getGet('create_order') === '1') {
            $actor = $this->currentActor($db);

            if ($actor) {
                $historyBuilder = $db->table('order_items oi')
                    ->select(
                        'oi.product_id, COALESCE(SUM(oi.quantity), 0) AS ordered_quantity, '
                        . 'COUNT(DISTINCT oi.order_id) AS order_count',
                        false
                    )
                    ->join('orders o', 'o.id = oi.order_id')
                    ->where('CAST(o.dealer_id AS CHAR)', (string)$dealerId);

                $historyBuilder->groupStart()
                    ->where('o.order_by_id', (int)$actor['id']);

                // Older dealer-created orders may predate order_by_id. A
                // dealer is unique within their own dealer account, so these
                // rows can be attributed safely without mixing staff users.
                if (($actor['role'] ?? '') === 'dealer') {
                    $historyBuilder->orGroupStart()
                        ->where('o.order_by_id IS NULL', null, false)
                        ->where('o.order_by', 'dealer')
                        ->groupEnd();
                }

                $historyRows = $historyBuilder
                    ->groupEnd()
                    ->groupBy('oi.product_id')
                    ->get()
                    ->getResultArray();

                $historyByProduct = [];
                foreach ($historyRows as $row) {
                    $historyByProduct[(string)$row['product_id']] = [
                        'quantity'    => (int)$row['ordered_quantity'],
                        'order_count' => (int)$row['order_count'],
                    ];
                }

                foreach ($products as &$product) {
                    $history = $historyByProduct[(string)$product['id']] ?? ['quantity' => 0, 'order_count' => 0];
                    $product['historical_ordered_quantity'] = $history['quantity'];
                    $product['historical_order_count'] = $history['order_count'];
                }
                unset($product);

                usort($products, static function (array $left, array $right) use ($historyByProduct): int {
                    $leftHistory = $historyByProduct[(string)$left['id']] ?? ['quantity' => 0, 'order_count' => 0];
                    $rightHistory = $historyByProduct[(string)$right['id']] ?? ['quantity' => 0, 'order_count' => 0];

                    return ($rightHistory['quantity'] <=> $leftHistory['quantity'])
                        ?: ($rightHistory['order_count'] <=> $leftHistory['order_count'])
                        ?: ((int)$right['id'] <=> (int)$left['id']);
                });
            }
        }

        foreach ($products as &$p) {
            $p = $this->hydrateProduct($p, $db);
        }
        unset($p);

        return $this->respond(array_values($products));
    }

    /**
     * Return product ordering totals for one customer within one dealer.
     * An empty history is a successful response because new customers have no
     * previous orders yet.
     */
    public function salesHistory()
    {
        $this->format = 'json';
        $dealerId = trim((string)$this->request->getGet('dealerid'));
        $retailerId = trim((string)$this->request->getGet('retailer_id'));

        if ($dealerId === '' || !ctype_digit($dealerId) || (int)$dealerId <= 0) {
            return $this->failValidationErrors('A valid dealerid is required');
        }
        if ($retailerId === '' || !ctype_digit($retailerId) || (int)$retailerId <= 0) {
            return $this->failValidationErrors('A valid retailer_id is required');
        }

        $db = \Config\Database::connect();
        $actor = $this->currentActor($db);
        if (!$actor) {
            return $this->failUnauthorized('Unauthorized');
        }

        $role = (string)($actor['role'] ?? '');
        $actorDealerId = $role === 'dealer'
            ? (string)($actor['id'] ?? '')
            : (string)($actor['dealer_id'] ?? '');
        if (!in_array($role, ['dealer', 'staff'], true) || $actorDealerId !== $dealerId) {
            return $this->failForbidden('You cannot view sales history for this dealer');
        }

        try {
            $retailerExists = $db->table('users')
                ->where('id', (int)$retailerId)
                ->where('role', 'retailer')
                ->where('CAST(dealer_id AS CHAR)', $dealerId)
                ->limit(1)
                ->countAllResults() > 0;
            if (!$retailerExists) {
                return $this->failNotFound('Customer not found for this dealer');
            }

            $rows = $db->table('order_items oi')
                ->select(
                    'oi.product_id, COALESCE(SUM(oi.quantity), 0) AS ordered_quantity, '
                    . 'COUNT(DISTINCT oi.order_id) AS order_count',
                    false
                )
                ->join('orders o', 'o.id = oi.order_id')
                ->where('CAST(o.dealer_id AS CHAR)', $dealerId)
                ->where('CAST(o.retailer_id AS CHAR)', $retailerId)
                ->where('oi.product_id IS NOT NULL', null, false)
                ->where('o.status !=', 'cancelled')
                ->groupBy('oi.product_id')
                ->get()
                ->getResultArray();

            $history = [];
            foreach ($rows as $row) {
                $history[(string)$row['product_id']] = [
                    'quantity' => (float)$row['ordered_quantity'],
                    'order_count' => (int)$row['order_count'],
                ];
            }

            return $this->respond((object)$history);
        } catch (\Throwable $e) {
            log_message(
                'error',
                'Customer sales history failed for dealer {dealer}, retailer {retailer}: {error}',
                ['dealer' => $dealerId, 'retailer' => $retailerId, 'error' => $e->getMessage()]
            );
            return $this->failServerError('Unable to load customer sales history');
        }
    }

    // ── POST /products ────────────────────────────────────────────────────────
    public function show($id = null)
    {
        if (!$id) return $this->failNotFound('Product ID required');

        $db = \Config\Database::connect();
        $product = $db->table('products p')
            ->select('p.*')
            ->where('p.id', (int)$id)
            ->get()->getRowArray();

        if (!$product) {
            return $this->failNotFound('Product not found');
        }

        return $this->respond($this->hydrateProduct($product, $db));
    }

    public function create()
    {
        $db       = \Config\Database::connect();
        $dealerId = $this->request->getPost('dealerid') ?? '';

        $authorized = $this->authorizeProductMutation($db, $dealerId);
        if ($authorized !== true) {
            return $authorized;
        }

        $attributesRaw = $this->request->getPost('attributes');
        $attributes    = $attributesRaw ? json_decode($attributesRaw, true) : [];
        if (!is_array($attributes)) $attributes = [];

        $designNumber = $this->extractDesignNumber(
            $attributes,
            $this->request->getPost('model') ?? ''
        );
        if ($designNumber !== '') {
            if ($this->isDesignNumberAlreadyUsed($db, $dealerId, $designNumber)) {
                return $this->duplicateDesignNumberResponse();
            }
            $attributes['design_number'] = $designNumber;
            $attributes['model'] = $designNumber;
        }

        $imagePath = $this->uploadImage(
            $this->request->getFile('image'),
            (string)$dealerId
        );

        $attributes = $this->prepareColorVariants($attributes, (string)$dealerId);
        $sizeSets = $this->normalizeSizeSets(
            $this->request->getPost('size_sets') ?? ($attributes['selected_size_sets'] ?? [])
        );
        $attributes['selected_size_sets'] = $sizeSets;

        if ($imagePath === '' && !empty($attributes['color_variants'][0]['image'])) {
            $imagePath = $attributes['color_variants'][0]['image'];
        }

        $galleryImages = $this->uploadGalleryImages(
            $this->normalizeGalleryFiles($this->request->getFiles()['gallery'] ?? []),
            (string)$dealerId
        );
        if (!empty($galleryImages)) {
            $attributes['gallery_images'] = $galleryImages;
        }

        $variantsRaw = $this->request->getPost('variants');
        $variants    = $variantsRaw ? json_decode($variantsRaw, true) : [];
        if (!is_array($variants)) $variants = [];

        $basePrice  = 0;
        $totalStock = 0;
        if (!empty($variants)) {
            $basePrice = $this->resolveVariantBasePrice($variants);
            $totalStock = $this->sumVariantStock($variants);
        } else {
            $basePrice  = (float)($this->request->getPost('price') ?? 0);
            $totalStock = (int)  ($this->request->getPost('stock') ?? 0);
        }

        $brand = $attributes['brand'] ?? ($this->request->getPost('brand') ?? '');
        $model = $designNumber !== '' ? $designNumber : ($attributes['model'] ?? ($this->request->getPost('model') ?? ''));
        $color = $this->request->getPost('color') ?? '';

        $productData = [
            'name'             => $this->request->getPost('name')             ?? '',
            'brand'            => $brand,
            'model'            => $model,
            'color'            => $color,
            'price'            => $basePrice,
            'stock'            => $totalStock,
            'description'      => $this->request->getPost('description')      ?? '',
            'dealerid'         => $dealerId,
            'master_id'        => 0,
            'dealer_company'   => '',
            'image'            => $imagePath,
            'business_type_id' => $this->request->getPost('business_type_id') ?? 1,
            'attributes'       => json_encode($attributes),
        ];

        if ($this->productsHaveDesignNumberColumn($db)) {
            $productData['design_number'] = $designNumber !== '' ? $designNumber : null;
        }

        if ($this->productsHaveShowInCreateOrderColumn($db)) {
            $productData['show_in_create_order'] = $this->request->getPost('show_in_create_order') === '1' ? 1 : 0;
        }

        if ($this->productsHaveSizeSetsColumn($db)) {
            $productData['size_sets'] = json_encode($sizeSets);
        }

        try {
            $db->table('products')->insert($productData);
        } catch (\Throwable $e) {
            if ($this->isDuplicateDesignNumberDbError($db, $e)) {
                return $this->duplicateDesignNumberResponse();
            }
            throw $e;
        }
        $productId = $db->insertID();

        if (!$productId) {
            if ($this->isDuplicateDesignNumberDbError($db)) {
                return $this->duplicateDesignNumberResponse();
            }
            return $this->failServerError('Failed to insert product');
        }

        $totalStock = 0;
        foreach ($variants as $v) {
            if (!$this->variantHasAnyValue($v)) {
                continue;
            }
            $qty = max(0, (int)($v['qty'] ?? 0));
            $db->table('product_variants')->insert([
                'product_id' => (int)$productId,
                'size'       => $v['size'] ?? '',
                'color'      => $v['color'] ?? '',
                'qty'        => $qty,
                'mrp'        => (float)($v['mrp']  ?? 0),
                'rate'       => (float)($v['rate'] ?? 0),
                'rack'       => $v['rack'] ?? '',
            ]);
            $totalStock += $qty;
        }

        if (!empty($variants)) {
            $db->table('products')->where('id', $productId)->update(['stock' => $totalStock]);
        }

        return $this->respondCreated([
            'success' => true,
            'id'      => $productId,
            'message' => 'Product created successfully',
        ]);
    }

    // ── POST /products/update/{id} ────────────────────────────────────────────
    public function update($id = null)
    {
        if (!$id) return $this->failNotFound('Product ID required');

        $db       = \Config\Database::connect();
        $existing = $db->table('products')->where('id', $id)->get()->getRowArray();
        if (!$existing) return $this->failNotFound('Product not found');

        $dealerId  = $this->request->getPost('dealerid') ?? $existing['dealerid'];
        $authorized = $this->authorizeProductMutation($db, $dealerId);
        if ($authorized !== true) {
            return $authorized;
        }

        $attributesRaw = $this->request->getPost('attributes');
        $attributes    = $attributesRaw ? json_decode($attributesRaw, true) : [];
        if (!is_array($attributes)) $attributes = [];

        $existingAttributes = [];
        if (!empty($existing['attributes'])) {
            $decoded = json_decode($existing['attributes'], true);
            if (is_array($decoded)) {
                $existingAttributes = $decoded;
            }
        }

        $designNumber = $this->extractDesignNumber(
            $attributes,
            $this->request->getPost('model') ?? ($existingAttributes['design_number'] ?? ($existing['design_number'] ?? ($existing['model'] ?? '')))
        );
        $existingDesignNumber = $this->extractDesignNumber(
            $existingAttributes,
            $existing['design_number'] ?? ($existing['model'] ?? '')
        );
        if ($designNumber !== '') {
            if ($designNumber !== $existingDesignNumber
                && $this->isDesignNumberAlreadyUsed($db, $dealerId, $designNumber, $id)) {
                return $this->duplicateDesignNumberResponse();
            }
            $attributes['design_number'] = $designNumber;
            $attributes['model'] = $designNumber;
        }

        $image     = $this->request->getFile('image');
        $imagePath = $existing['image'] ?? '';

        if ($image && $image->isValid() && !$image->hasMoved()) {
            $imagePath = $this->uploadImage($image, (string)$dealerId);
        }

        $attributes = $this->prepareColorVariants(
            $attributes,
            (string)$dealerId,
            $existingAttributes
        );
        $sizeSets = $this->normalizeSizeSets(
            $this->request->getPost('size_sets') ?? ($attributes['selected_size_sets'] ?? ($existingAttributes['selected_size_sets'] ?? []))
        );
        $attributes['selected_size_sets'] = $sizeSets;

        if ($imagePath === '' && !empty($attributes['color_variants'][0]['image'])) {
            $imagePath = $attributes['color_variants'][0]['image'];
        }

        $galleryKeepRaw = $this->request->getPost('gallery_keep');
        $galleryKeep = $galleryKeepRaw ? json_decode($galleryKeepRaw, true) : [];
        if (!is_array($galleryKeep)) $galleryKeep = [];

        $galleryImages = $this->uploadGalleryImages(
            $this->normalizeGalleryFiles($this->request->getFiles()['gallery'] ?? []),
            (string)$dealerId
        );
        if (!empty($galleryKeep) || !empty($galleryImages)) {
            $attributes['gallery_images'] = array_values(array_unique(array_merge($galleryKeep, $galleryImages)));
        } elseif (!empty($existingAttributes['gallery_images']) && empty($attributes['gallery_images'])) {
            $attributes['gallery_images'] = $existingAttributes['gallery_images'];
        }

        $variantsRaw = $this->request->getPost('variants');
        $variants    = $variantsRaw ? json_decode($variantsRaw, true) : null;

        $brand = $attributes['brand'] ?? ($this->request->getPost('brand') ?? $existing['brand']);
        $model = $designNumber !== '' ? $designNumber : ($attributes['model'] ?? ($this->request->getPost('model') ?? $existing['model']));
        $color = $this->request->getPost('color') ?? ($existing['color'] ?? '');

        $updateData = [
            'name'        => $this->request->getPost('name')        ?? $existing['name'],
            'brand'       => $brand,
            'model'       => $model,
            'color'       => $color,
            'description' => $this->request->getPost('description') ?? $existing['description'],
            'image'       => $imagePath,
            'attributes'  => json_encode($attributes),
        ];

        if ($this->productsHaveDesignNumberColumn($db)) {
            $updateData['design_number'] = $designNumber !== '' ? $designNumber : null;
        }

        if ($this->productsHaveShowInCreateOrderColumn($db)) {
            $updateData['show_in_create_order'] = $this->request->getPost('show_in_create_order') === '1' ? 1 : 0;
        }

        if ($this->productsHaveSizeSetsColumn($db)) {
            $updateData['size_sets'] = json_encode($sizeSets);
        }

        if ($variants === null) {
            $updateData['price'] = (float)($this->request->getPost('price') ?? $existing['price']);
            $updateData['stock'] = (int)  ($this->request->getPost('stock') ?? $existing['stock']);
        }

        try {
            $updated = $db->table('products')->where('id', $id)->update($updateData);
        } catch (\Throwable $e) {
            if ($this->isDuplicateDesignNumberDbError($db, $e)) {
                return $this->duplicateDesignNumberResponse();
            }
            throw $e;
        }

        if (!$updated && $this->isDuplicateDesignNumberDbError($db)) {
            return $this->duplicateDesignNumberResponse();
        }

        if ($variants !== null && is_array($variants)) {
            $db->table('product_variants')->where('product_id', $id)->delete();

            $totalStock = 0;
            foreach ($variants as $v) {
                if (!$this->variantHasAnyValue($v)) {
                    continue;
                }
                $qty = max(0, (int)($v['qty'] ?? 0));
                $db->table('product_variants')->insert([
                    'product_id' => (int)$id,
                    'size'       => $v['size']  ?? '',
                    'color'      => $v['color'] ?? '',
                    'qty'        => $qty,
                    'mrp'        => (float)($v['mrp']  ?? 0),
                    'rate'       => (float)($v['rate'] ?? 0),
                    'rack'       => $v['rack']  ?? '',
                ]);
                $totalStock += $qty;
            }

            $basePrice = $this->resolveVariantBasePrice($variants, 0);

            $db->table('products')->where('id', $id)->update([
                'price' => $basePrice,
                'stock' => $totalStock,
            ]);
        }

        return $this->respond([
            'success' => true,
            'id'      => $id,
            'message' => 'Product updated successfully',
        ]);
    }

    // ── DELETE /products/{id} ─────────────────────────────────────────────────
    public function updateShowInCreateOrder($id = null)
    {
        if (!$id) return $this->failNotFound('Product ID required');

        $db = \Config\Database::connect();
        $product = $db->table('products')->where('id', (int)$id)->get()->getRowArray();
        if (!$product) {
            return $this->failNotFound('Product not found');
        }

        $authorized = $this->authorizeProductMutation($db, $product['dealerid'] ?? null);
        if ($authorized !== true) {
            return $authorized;
        }

        if (!$this->ensureProductsHaveShowInCreateOrderColumn($db)) {
            return $this->failServerError(
                'Product visibility column is missing. Please run database migrations and try again.'
            );
        }

        $payload = $this->request->getJSON(true);
        if (!is_array($payload)) {
            $payload = $this->request->getPost();
        }

        if (!array_key_exists('show_in_create_order', $payload)) {
            return $this->failValidationErrors('show_in_create_order is required');
        }

        $value = filter_var($payload['show_in_create_order'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;

        try {
            $updated = $db->table('products')
                ->where('id', (int)$id)
                ->update(['show_in_create_order' => $value]);

            if ($updated === false) {
                $dbError = $db->error();
                log_message(
                    'error',
                    'Failed to update show_in_create_order for product {productId}: [{code}] {message}',
                    [
                        'productId' => (int)$id,
                        'code' => $dbError['code'] ?? 'unknown',
                        'message' => $dbError['message'] ?? 'unknown database error',
                    ]
                );

                return $this->failServerError('Failed to update product visibility: database update failed.');
            }
        } catch (\Throwable $exception) {
            log_message(
                'error',
                'Exception updating show_in_create_order for product {productId}: {message}',
                [
                    'productId' => (int)$id,
                    'message' => $exception->getMessage(),
                ]
            );

            return $this->failServerError('Failed to update product visibility: ' . $exception->getMessage());
        }

        return $this->respond([
            'success' => true,
            'id' => (int)$id,
            'business_type_id' => isset($product['business_type_id']) ? (int)$product['business_type_id'] : null,
            'show_in_create_order' => $value,
            'message' => $value ? 'Product enabled for Create Order' : 'Product hidden from Create Order',
        ]);
    }

    public function deliveredOrderUsage($id = null)
    {
        if (!$id) return $this->failNotFound('Product ID required');

        $db = \Config\Database::connect();
        $actor = $this->currentActor($db);
        if (!$actor) {
            return $this->failUnauthorized('Unauthorized');
        }

        $product = $db->table('products')
            ->select('id, dealerid')
            ->where('id', (int)$id)
            ->get()
            ->getRowArray();

        if (!$product) {
            return $this->failNotFound('Product not found');
        }

        if (($actor['role'] ?? '') === 'dealer' && (string)($actor['id'] ?? '') !== (string)($product['dealerid'] ?? '')) {
            return $this->failForbidden('You cannot manage products for this dealer');
        }

        if (($actor['role'] ?? '') === 'staff' && (string)($actor['dealer_id'] ?? '') !== (string)($product['dealerid'] ?? '')) {
            return $this->failForbidden('You cannot manage products for this dealer');
        }

        if (!in_array($actor['role'] ?? '', ['dealer', 'staff'], true)) {
            return $this->failForbidden('You do not have permission to manage products');
        }

        $usedInDeliveredOrder = $this->isProductUsedInDeliveredOrder($db, (int)$id);

        return $this->respond([
            'success' => true,
            'usedInDeliveredOrder' => $usedInDeliveredOrder,
            'message' => $usedInDeliveredOrder ? self::DELIVERED_PRODUCT_DELETE_MESSAGE : '',
        ]);
    }

    public function delete($id = null)
    {
        if (!$id) return $this->failNotFound('Product ID required');
        $db = \Config\Database::connect();
        $actor = $this->currentActor($db);
        if (!$actor) {
            return $this->failUnauthorized('Unauthorized');
        }
        if (($actor['role'] ?? '') !== 'dealer') {
            return $this->failForbidden('Only dealers can delete products');
        }

        $product = $db->table('products')
            ->select('id, dealerid')
            ->where('id', (int)$id)
            ->get()
            ->getRowArray();

        if (!$product) {
            return $this->failNotFound('Product not found');
        }

        if ((string)($actor['id'] ?? '') !== (string)($product['dealerid'] ?? '')) {
            return $this->failForbidden('You cannot manage products for this dealer');
        }

        if ($this->isProductUsedInDeliveredOrder($db, (int)$id)) {
            return $this->fail(self::DELIVERED_PRODUCT_DELETE_MESSAGE, 409);
        }

        $db->table('products')->where('id', (int)$id)->delete();
        return $this->respond(['success' => true, 'message' => 'Product deleted']);
    }

    // ── GET /products/for-tally ───────────────────────────────────────────────
    public function forTally()
    {
        $db = \Config\Database::connect();
        try {
            $dealer = TallyAuthContext::dealer();
            $builder = $db->table('products as p');
            // Live installations are upgraded incrementally. Selecting an
            // optional column which is not present (notably design_number or
            // show_in_create_order) makes this bridge endpoint return HTTP
            // 500 before it can return any products. Build the projection
            // from the actual schema while keeping the common response shape.
            $productFields = array_flip($db->getFieldNames('products'));
            $columns = ['id', 'name', 'brand', 'model', 'color', 'price', 'stock', 'description', 'dealerid', 'business_type_id', 'attributes'];
            foreach (['design_number', 'show_in_create_order'] as $optional) {
                if (isset($productFields[$optional])) {
                    $columns[] = $optional;
                }
            }
            $builder->select(implode(', ', array_map(static fn(string $column): string => 'p.' . $column, $columns)) . ', u.company_name as dealer_company');
            $builder->join('users as u', 'u.id = p.dealerid', 'left');
            $builder->where('CAST(p.dealerid AS CHAR)', (string)$dealer['id']);
            $products  = $builder->get()->getResultArray();
            $productIds = array_map(static fn(array $product) => (int)$product['id'], $products);
            $variantsByProduct = [];
            if ($productIds !== []) {
                $variantRows = $db->table('product_variants')
                    ->whereIn('product_id', $productIds)
                    ->orderBy('id', 'ASC')
                    ->get()
                    ->getResultArray();
                foreach ($variantRows as $variant) {
                    $variantsByProduct[(int)$variant['product_id']][] = $variant;
                }
            }
            $normalizer = new TallyProductNormalizer();
            $formatted = array_map(
                static fn(array $item) => $normalizer->toCommonSchema(
                    $item,
                    $variantsByProduct[(int)$item['id']] ?? []
                ),
                $products
            );
            return $this->respond($formatted);
        } catch (\Throwable $e) {
            log_message('error', 'Tally product fetch error: ' . $e->getMessage());
            return $this->failServerError('Failed to fetch product list for Tally');
        }
    }

    // ── POST /products/import ─────────────────────────────────────────────────
    private function importRowValue(array $row, array $keys, $default = '')
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $row) && $row[$key] !== null) {
                return is_string($row[$key]) ? trim($row[$key]) : $row[$key];
            }
        }
        return $default;
    }

    private function importNumber($value): float
    {
        if (is_string($value)) {
            $value = preg_replace('/[^0-9.\-]/', '', $value);
        }
        return is_numeric($value) ? (float)$value : 0.0;
    }

    private function importNumberOrNull($value): ?float
    {
        if ($value === null || trim((string)$value) === '') {
            return null;
        }

        if (is_string($value)) {
            $value = preg_replace('/[^0-9.\-]/', '', $value);
        }

        return is_numeric($value) ? (float)$value : null;
    }

    private function importList($value): array
    {
        if (is_array($value)) {
            $items = $value;
        } else {
            $items = preg_split('/[,|]+/', (string)$value) ?: [];
        }

        return array_values(array_unique(array_filter(array_map(
            static fn($item) => trim((string)$item),
            $items
        ))));
    }

    private function importDateValue($value, int $rowNumber, string $label): string
    {
        $text = trim((string)$value);
        if ($text === '') {
            return '';
        }

        if (is_numeric($value)) {
            $timestamp = ((float)$value - 25569) * 86400;
            return gmdate('Y-m-d', (int)$timestamp);
        }

        $timestamp = strtotime($text);
        if ($timestamp === false) {
            throw new \RuntimeException("Row {$rowNumber}: {$label} must be a valid date");
        }

        return date('Y-m-d', $timestamp);
    }

    private function requireDairyOption(string $value, array $allowed, int $rowNumber, string $label): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }

        foreach ($allowed as $option) {
            if (strcasecmp($value, $option) === 0) {
                return $option;
            }
        }

        throw new \RuntimeException("Row {$rowNumber}: {$label} must be one of: " . implode(', ', $allowed));
    }

    private function normalizeDairyOptionList($value, array $allowed, int $rowNumber, string $label): array
    {
        $items = $this->importList($value);
        return array_values(array_map(
            fn($item) => $this->requireDairyOption($item, $allowed, $rowNumber, $label),
            $items
        ));
    }

    private function normalizeImportedDairyProductRow(array $row, int $index, $fallbackDealerId = null): array
    {
        $rowNumber = $index + 2;
        $dealerId = $this->importRowValue($row, ['dealerid', 'dealer_id', 'Dealer ID'], $fallbackDealerId);
        $productName = (string)$this->importRowValue($row, ['Product Name', 'product_name', 'name']);
        $category = $this->requireDairyOption(
            (string)$this->importRowValue($row, ['Category', 'category']),
            self::DAIRY_CATEGORIES,
            $rowNumber,
            'Category'
        );
        $brand = (string)$this->importRowValue($row, ['Brand', 'brand']);
        $sku = (string)$this->importRowValue($row, ['SKU', 'Sku', 'sku']);
        $barcode = (string)$this->importRowValue($row, ['Barcode', 'barcode']);
        $purchasePrice = $this->importNumberOrNull($this->importRowValue($row, ['Purchase Price', 'purchase_price']));
        $sellingPrice = $this->importNumberOrNull($this->importRowValue($row, ['Selling Price', 'selling_price', 'Rate', 'rate', 'price']));
        $mrp = $this->importNumberOrNull($this->importRowValue($row, ['MRP', 'Mrp', 'mrp']));
        $gst = $this->importNumberOrNull($this->importRowValue($row, ['GST %', 'GST', 'gst_percent', 'gst']));
        $stock = $this->importNumberOrNull($this->importRowValue($row, ['Stock', 'stock']));
        $minimumStock = $this->importNumberOrNull($this->importRowValue($row, ['Minimum Stock', 'Minimum Stock Alert', 'minimum_stock_alert']));
        $packSizes = $this->importList($this->importRowValue($row, ['Weight/Volume', 'Pack Size', 'pack_size', 'size']));
        $unit = (string)$this->importRowValue($row, ['Unit', 'unit']);
        $packaging = $this->normalizeDairyOptionList($this->importRowValue($row, ['Packaging', 'packaging']), self::DAIRY_PACKAGING, $rowNumber, 'Packaging');
        $flavors = $this->normalizeDairyOptionList($this->importRowValue($row, ['Flavor', 'Flavour', 'flavor']), self::DAIRY_FLAVORS, $rowNumber, 'Flavor');
        $types = $this->normalizeDairyOptionList($this->importRowValue($row, ['Type', 'Dairy Type', 'dairy_type']), self::DAIRY_TYPES, $rowNumber, 'Type');
        $storageVariants = $this->normalizeDairyOptionList($this->importRowValue($row, ['Storage', 'storage']), self::DAIRY_STORAGE_VARIANTS, $rowNumber, 'Storage');
        $batchNumber = (string)$this->importRowValue($row, ['Batch Number', 'batch_number']);
        $manufacturingDate = $this->importDateValue($this->importRowValue($row, ['Manufacturing Date', 'manufacturing_date']), $rowNumber, 'Manufacturing Date');
        $expiryDate = $this->importDateValue($this->importRowValue($row, ['Expiry Date', 'expiry_date']), $rowNumber, 'Expiry Date');
        $shelfLife = (string)$this->importRowValue($row, ['Shelf Life', 'shelf_life']);
        $storageType = $this->requireDairyOption(
            (string)$this->importRowValue($row, ['Storage Type', 'storage_type']),
            self::DAIRY_STORAGE_TYPES,
            $rowNumber,
            'Storage Type'
        );
        $supplierName = (string)$this->importRowValue($row, ['Supplier Name', 'supplier_name']);
        $description = (string)$this->importRowValue($row, ['Description', 'description']);

        if (!$dealerId) {
            throw new \RuntimeException("Row {$rowNumber}: dealerid is required");
        }
        if ($productName === '') {
            throw new \RuntimeException("Row {$rowNumber}: Product Name is required");
        }
        if ($sellingPrice === null || $sellingPrice <= 0) {
            throw new \RuntimeException("Row {$rowNumber}: Selling Price is required and must be greater than 0");
        }
        if ($mrp !== null && $mrp < 0) {
            throw new \RuntimeException("Row {$rowNumber}: MRP cannot be negative");
        }
        if ($purchasePrice !== null && $purchasePrice < 0) {
            throw new \RuntimeException("Row {$rowNumber}: Purchase Price cannot be negative");
        }
        if ($gst !== null && ($gst < 0 || $gst > 100)) {
            throw new \RuntimeException("Row {$rowNumber}: GST % must be between 0 and 100");
        }
        if ($stock !== null && $stock < 0) {
            throw new \RuntimeException("Row {$rowNumber}: Stock cannot be negative");
        }
        if ($minimumStock !== null && $minimumStock < 0) {
            throw new \RuntimeException("Row {$rowNumber}: Minimum Stock cannot be negative");
        }
        if ($manufacturingDate !== '' && $expiryDate !== '' && strtotime($expiryDate) < strtotime($manufacturingDate)) {
            throw new \RuntimeException("Row {$rowNumber}: Expiry Date cannot be earlier than Manufacturing Date");
        }
        if (empty($packSizes)) {
            throw new \RuntimeException("Row {$rowNumber}: Weight/Volume is required");
        }

        $stockQty = (int)round($stock ?? 0);
        $variantLabelParts = array_filter([
            $packaging[0] ?? '',
            $flavors[0] ?? '',
            $types[0] ?? '',
            $storageVariants[0] ?? '',
        ]);

        $attributes = [
            'category' => $category,
            'brand' => $brand,
            'sku' => $sku,
            'barcode' => $barcode,
            'purchase_price' => $purchasePrice,
            'selling_price' => $sellingPrice,
            'mrp' => $mrp ?? $sellingPrice,
            'gst_percent' => $gst ?? 0,
            'stock' => $stockQty,
            'minimum_stock_alert' => (int)round($minimumStock ?? 0),
            'size' => $packSizes,
            'unit' => $unit,
            'packaging' => $packaging,
            'flavor' => $flavors,
            'dairy_type' => $types,
            'storage' => $storageVariants,
            'batch_number' => $batchNumber,
            'manufacturing_date' => $manufacturingDate,
            'expiry_date' => $expiryDate,
            'shelf_life' => $shelfLife,
            'storage_type' => $storageType,
            'supplier_name' => $supplierName,
            'description' => $description,
            'product_description' => $description,
        ];

        $variants = array_map(function ($packSize) use ($stockQty, $mrp, $sellingPrice, $variantLabelParts) {
            return [
                'size' => $packSize,
                'color' => implode(' / ', $variantLabelParts),
                'qty' => $stockQty,
                'mrp' => (float)($mrp ?? $sellingPrice),
                'rate' => (float)$sellingPrice,
                'rack' => '',
            ];
        }, $packSizes);

        return [
            'product' => [
                'name' => $productName,
                'brand' => $brand,
                'model' => $sku,
                'design_number' => null,
                'color' => '',
                'price' => (float)$sellingPrice,
                'stock' => $stockQty,
                'description' => $description,
                'dealerid' => (string)$dealerId,
                'master_id' => 0,
                'dealer_company' => '',
                'image' => '',
                'business_type_id' => self::BUSINESS_TYPE_DAIRY,
                'attributes' => json_encode($attributes),
            ],
            'variants' => $variants,
        ];
    }

    private function normalizeImportedProductRow(array $row, int $index): array
    {
        $itemName = (string)$this->importRowValue($row, ['Item Name', 'item_name', 'name']);
        $itemCode = (string)$this->importRowValue($row, ['Item Code', 'item_code', 'model']);
        $launchDate = (string)$this->importRowValue($row, ['Launch Date', 'launch_date']);
        $hsnCode = (string)$this->importRowValue($row, ['HSN Code', 'hsn_code', 'hsnCode']);
        $category = (string)$this->importRowValue($row, ['Category', 'category']);
        $subCategory = (string)$this->importRowValue($row, ['Sub-Category', 'sub_category', 'subCategory']);
        $unit = (string)$this->importRowValue($row, ['Unit', 'unit']);
        $description = (string)$this->importRowValue($row, ['Description', 'description']);
        $materialFabric = (string)$this->importRowValue($row, ['Material/Fabric', 'material_fabric', 'fabric_type']);
        $mrp = $this->importNumber($this->importRowValue($row, ['MRP', 'Mrp', 'mrp']));
        $rate = $this->importNumber($this->importRowValue($row, ['Rate', 'rate', 'price']));
        $colour = (string)$this->importRowValue($row, ['Colour', 'Color', 'colour', 'color']);
        $size = (string)$this->importRowValue($row, ['Size', 'size']);
        $dealerId = $this->importRowValue($row, ['dealerid', 'dealer_id', 'Dealer ID']);
        $businessTypeId = $this->importRowValue($row, ['business_type_id'], 2);

        $rowNumber = $index + 2;
        if ($itemName === '') {
            throw new \RuntimeException("Row {$rowNumber}: Item Name is required");
        }
        if ($rate <= 0 && $mrp <= 0) {
            throw new \RuntimeException("Row {$rowNumber}: Rate or MRP is required");
        }
        if (!$dealerId) {
            throw new \RuntimeException("Row {$rowNumber}: dealerid is required");
        }

        $colors = $this->importList($colour);
        $sizes = $this->importList($size);
        if (empty($colors)) $colors = [''];
        if (empty($sizes)) $sizes = [''];

        $attributes = [
            'item_code' => $itemCode,
            'design_number' => $itemCode,
            'launch_date' => $launchDate,
            'hsn_code' => $hsnCode,
            'custom_hsn_code' => $hsnCode,
            'category' => $category,
            'sub_category' => $subCategory,
            'unit' => $unit,
            'material_fabric' => $materialFabric,
            'fabric_type' => $materialFabric,
            'product_description' => $description,
            'available_colors' => array_values(array_filter($colors)),
            'mrp' => $mrp,
        ];

        $variants = [];
        foreach ($colors as $color) {
            foreach ($sizes as $variantSize) {
                $variants[] = [
                    'size' => $variantSize,
                    'color' => $color,
                    'qty' => 0,
                    'mrp' => $mrp,
                    'rate' => $rate > 0 ? $rate : $mrp,
                    'rack' => '',
                ];
            }
        }

        return [
            'product' => [
                'name' => $itemName,
                'brand' => '',
                'model' => $itemCode,
                'design_number' => $itemCode !== '' ? $this->normalizeDesignNumber($itemCode) : null,
                'color' => implode(', ', array_filter($colors)),
                'price' => $rate > 0 ? $rate : $mrp,
                'stock' => 0,
                'description' => $description,
                'dealerid' => (string)$dealerId,
                'master_id' => 0,
                'dealer_company' => '',
                'image' => '',
                'business_type_id' => $businessTypeId ?: 2,
                'attributes' => json_encode($attributes),
            ],
            'variants' => $variants,
        ];
    }

    public function import()
    {
        try {
            $authenticatedDealer = TallyAuthContext::dealer();
            $data             = $this->request->getJSON(true);
            $products         = $data['products'] ?? [];
            $model            = new ProductModel();
            $insertedProducts = [];
            $canonicalProducts = [];
            $syncResults = [];
            $db               = \Config\Database::connect();
            $tallyNormalizer  = new TallyProductNormalizer();

            if (!$db->fieldExists('amount', 'product_variants')) {
                $db->query('ALTER TABLE product_variants ADD COLUMN amount DECIMAL(15,2) NULL AFTER rate');
            }

            if (!is_array($products) || empty($products)) {
                return $this->failValidationErrors('No products found in import file');
            }

            $firstDealerId = (int)$authenticatedDealer['id'];
            TallyApiAuthenticator::assertDealerReference($authenticatedDealer, $data['dealerid'] ?? $data['dealer_id'] ?? null);
            $requestedBusinessTypeId = (int)($data['business_type_id'] ?? $authenticatedDealer['business_type_id']);
            if ($requestedBusinessTypeId > 0 && $requestedBusinessTypeId !== (int)$authenticatedDealer['business_type_id']) {
                return $this->failForbidden('business_type_id does not match the authenticated dealer');
            }
            $firstBusinessTypeId = (int)$authenticatedDealer['business_type_id'];
            $isDairyImport = $firstBusinessTypeId === self::BUSINESS_TYPE_DAIRY;

            $db->transStart();

            foreach (array_values($products) as $index => $row) {
                if (!is_array($row)) {
                    throw new \RuntimeException('Invalid product row at index ' . ($index + 1));
                }

                $rowDealerId = $this->importRowValue($row, ['dealerid', 'dealer_id', 'Dealer ID']);
                TallyApiAuthenticator::assertDealerReference($authenticatedDealer, $rowDealerId);
                $rowBusinessTypeId = (int)$this->importRowValue($row, ['business_type_id', 'Business Type ID'], $firstBusinessTypeId);
                if ($rowBusinessTypeId !== $firstBusinessTypeId) {
                    throw new \RuntimeException('business_type_id does not match the authenticated dealer');
                }
                if ($isDairyImport && $rowBusinessTypeId !== self::BUSINESS_TYPE_DAIRY) {
                    throw new \RuntimeException('All imported Dairy products must use business_type_id = 3');
                }

                $normalized = $tallyNormalizer->isCommonTallyRow($row)
                    ? $tallyNormalizer->normalize($row, $index + 2, $rowBusinessTypeId ?: $firstBusinessTypeId, $firstDealerId)
                    : ($isDairyImport
                        ? $this->normalizeImportedDairyProductRow($row, $index, $firstDealerId)
                        : $this->normalizeImportedProductRow($row, $index));
                $product = $normalized['product'];
                $variants = $normalized['variants'];

                // Older/live schemas may not yet have optional product columns.
                // Do not let a model allowed-field create an unknown-column error.
                if (!$this->productsHaveDesignNumberColumn($db)) {
                    unset($product['design_number']);
                }

                $mappedId = (int)($row['oms_record_id'] ?? $row['omsRecordId'] ?? 0);
                $existingProducts = $mappedId > 0
                    ? $model->where('id', $mappedId)->where('dealerid', (string)$firstDealerId)->findAll()
                    : $model->where('name', $product['name'])->where('dealerid', (string)$firstDealerId)->findAll();
                if ($mappedId > 0 && empty($existingProducts)) {
                    throw new \RuntimeException('Mapped product does not belong to this dealer');
                }
                $isExistingProduct = !empty($existingProducts);
                if ($db->fieldExists('tally_active', 'products')) {
                    $product['tally_active'] = 1;
                    $product['tally_deleted_at'] = null;
                }

                try {
                    if ($isExistingProduct) {
                        $id = (int)$existingProducts[0]['id'];
                        foreach ($existingProducts as $existingProduct) {
                            if (!$model->update((int)$existingProduct['id'], $product)) {
                                throw new \RuntimeException('product update failed');
                            }
                        }
                    } else {
                        $id = $model->insert($product);
                    }
                } catch (\Throwable $e) {
                    throw new \RuntimeException(
                        "Row " . ($index + 2) . " ({$product['name']}): product " .
                        ($isExistingProduct ? 'update' : 'insert') . " failed: " . $e->getMessage(),
                        0,
                        $e
                    );
                }
                if (!$id) {
                    $modelErrors = $model->errors();
                    $dbError = $db->error();
                    $detail = $modelErrors
                        ? implode('; ', array_values($modelErrors))
                        : trim((string)($dbError['message'] ?? ''));
                    throw new \RuntimeException(
                        "Row " . ($index + 2) . " ({$product['name']}): product insert failed" .
                        ($detail !== '' ? ": {$detail}" : '')
                    );
                }

                if ($isExistingProduct && !empty($variants)) {
                    $existingVariants = $db->table('product_variants')->where('product_id', (int)$id)->get()->getResultArray();
                    $existingBySize = [];
                    foreach ($existingVariants as $existingVariant) {
                        $existingBySize[(string)$existingVariant['size']] = $existingVariant;
                    }
                    $tallySizes = [];
                    foreach ($variants as $variant) {
                        $tallySizes[] = (string)$variant['size'];
                        $variantData = [
                            'qty' => (int)$variant['qty'], 'mrp' => (float)$variant['mrp'],
                            'rate' => (float)$variant['rate'], 'amount' => (float)($variant['amount'] ?? ((float)$variant['qty'] * (float)$variant['rate'])),
                            'rack' => $variant['rack'], 'color' => $variant['color'],
                        ];
                        if (isset($existingBySize[(string)$variant['size']])) {
                            $db->table('product_variants')->where('id', (int)$existingBySize[(string)$variant['size']]['id'])->update($variantData);
                        } else {
                            $variantData['product_id'] = (int)$id;
                            $variantData['size'] = (string)$variant['size'];
                            $db->table('product_variants')->insert($variantData);
                        }
                    }
                    if (!empty($tallySizes)) {
                        $db->table('product_variants')->where('product_id', (int)$id)->whereNotIn('size', $tallySizes)->delete();
                    }
                }

                foreach ($isExistingProduct ? [] : $variants as $variantIndex => $variant) {
                    $inserted = $db->table('product_variants')->insert([
                        'product_id' => (int)$id,
                        'size' => $variant['size'],
                        'color' => $variant['color'],
                        'qty' => (int)$variant['qty'],
                        'mrp' => (float)$variant['mrp'],
                        'rate' => (float)$variant['rate'],
                        'amount' => (float)($variant['amount'] ?? ((float)$variant['qty'] * (float)$variant['rate'])),
                        'rack' => $variant['rack'],
                    ]);
                    if (!$inserted) {
                        $dbError = $db->error();
                        $detail = trim((string)($dbError['message'] ?? ''));
                        throw new \RuntimeException(
                            "Row " . ($index + 2) . " ({$product['name']}): variant " . ($variantIndex + 1) .
                            " insert failed" . ($detail !== '' ? ": {$detail}" : '')
                        );
                    }
                }

                $product['id'] = $id;
                $product['variants'] = $variants;
                $product['attributes'] = json_decode($product['attributes'], true);
                $product['size_range'] = $this->productSizeRange($variants, [], $product['attributes']);
                $product['attributes']['size_range'] = $product['size_range'];
                $insertedProducts[] = $product;
                $canonicalProducts[] = $tallyNormalizer->toCommonSchema($product, $variants);
                $syncResults[] = ['index'=>$index, 'action'=>$isExistingProduct ? 'updated' : 'inserted', 'record_id'=>(int)$id, 'match'=>$mappedId > 0 ? 'mapping' : ($isExistingProduct ? 'dealer_name' : 'new')];
            }

            $db->transComplete();

            if ($db->transStatus() === false) {
                return $this->failServerError('Failed to import products');
            }

            return $this->respondCreated([
                'success' => true,
                'products' => $canonicalProducts,
                'insertedProducts' => $insertedProducts,
                'sync_results' => $syncResults,
            ]);
        } catch (\App\Exceptions\TallyAuthenticationException $e) {
            if (isset($db)) $db->transRollback();
            return $this->respond(['error' => $e->getMessage()], $e->statusCode());
        } catch (\Throwable $e) {
            if (isset($db)) $db->transRollback();
            return $this->failValidationErrors($e->getMessage());
        }
    }

    // ── DELETE /products/tally/{id} ───────────────────────────────────────────
    public function deleteFromTally($id = null)
    {
        if (!$id) return $this->failValidationErrors('Product ID is required');
        $dealer = TallyAuthContext::dealer();
        $model = new ProductModel();
        $product = $model->find($id);
        if (!$product || (string)($product['dealerid'] ?? '') !== (string)$dealer['id']) return $this->failNotFound('Product not found');

        $db = \Config\Database::connect();
        if ($this->isProductUsedInDeliveredOrder($db, (int)$id)) {
            return $this->fail(self::DELIVERED_PRODUCT_DELETE_MESSAGE, 409);
        }

        $model->delete($id);
        return $this->respondDeleted(['success' => true, 'message' => 'Product deleted from Tally successfully']);
    }

    // ── POST /products/tally/update ───────────────────────────────────────────
    public function updateFromTally()
    {
        $dealer = TallyAuthContext::dealer();
        $input = $this->request->getJSON(true);
        if (!$input || !isset($input['products']) || !is_array($input['products'])) {
            return $this->failValidationErrors('Invalid JSON format. "products" array required.');
        }
        $model = new ProductModel();
        $db = \Config\Database::connect();
        $normalizer = new TallyProductNormalizer();
        $updatedProducts = [];
        $errors = [];
        foreach ($input['products'] as $productData) {
            try {
                TallyApiAuthenticator::assertDealerReference($dealer, $productData['dealerid'] ?? $productData['dealer_id'] ?? null);
            } catch (\App\Exceptions\TallyAuthenticationException $e) {
                return $this->failForbidden($e->getMessage());
            }
            $name = $productData['name'] ?? null;
            if (!$name) { $errors[] = 'Product name missing'; continue; }
            $existing = $model->where('name', $name)->where('dealerid', (string)$dealer['id'])->first();
            if (!$existing) { $errors[] = "Product not found: {$name}"; continue; }
            $attributes = json_decode((string)($existing['attributes'] ?? ''), true);
            if (!is_array($attributes)) $attributes = [];
            $attributeMap = [
                'alias' => ['alias'], 'stock_group' => ['stock_group'], 'category' => ['stock_group'],
                'sku' => ['sku'], 'part_number' => ['sku'], 'barcode' => ['barcode'],
                'hsn_code' => ['hsn_code'], 'gst_percent' => ['gst_percent'], 'unit' => ['unit'],
                'purchase_price' => ['purchase_price'], 'mrp' => ['mrp'],
                'minimum_stock_alert' => ['minimum_stock_alert'], 'weight' => ['weight'],
                'packaging' => ['packaging'], 'flavor' => ['flavor'], 'dairy_type' => ['dairy_type'],
                'storage' => ['storage'], 'design_number' => ['design_number'], 'size' => ['size'],
                'fabric' => ['fabric'], 'model' => ['model'], 'ram' => ['ram'],
                'storage_capacity' => ['storage_capacity'], 'color' => ['color'],
            ];
            foreach ($attributeMap as $target => $sourceKeys) {
                foreach ($sourceKeys as $source) {
                    if (array_key_exists($source, $productData)) {
                        $attributes[$target] = $productData[$source];
                        break;
                    }
                }
            }
            $stock = $existing['stock'];
            if (array_key_exists('stock', $productData)) {
                $parsedStock = $normalizer->normalizeStock($productData['stock'], $productData['unit'] ?? null);
                $stock = (int)round($parsedStock['quantity']);
                $attributes['stock_quantity'] = $parsedStock['quantity'];
                if ($parsedStock['unit']) $attributes['unit'] = $parsedStock['unit'];
            }
            $sellingPrice = $productData['selling_price'] ?? $productData['rate'] ?? $productData['price'] ?? $existing['price'];
            $attributes['selling_price'] = (float)$sellingPrice;
            $data = array_filter([
                'brand'          => $productData['brand']          ?? $existing['brand'],
                'model'          => $productData['model']          ?? $existing['model'],
                'design_number'  => $productData['design_number']  ?? ($existing['design_number'] ?? null),
                'color'          => $productData['color']          ?? ($existing['color'] ?? null),
                'price'          => (float)$sellingPrice,
                'stock'          => $stock,
                'description'    => $productData['description']    ?? $existing['description'],
                'dealerid'       => (string)$dealer['id'],
                'master_id'      => $productData['master_id']      ?? $existing['master_id'],
                'dealer_company' => $productData['dealer_company'] ?? $existing['dealer_company'],
                'show_in_create_order' => array_key_exists('show_in_create_order', $productData)
                    ? (filter_var($productData['show_in_create_order'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0)
                    : ($existing['show_in_create_order'] ?? 0),
                'attributes' => json_encode($attributes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ], fn($v) => $v !== null);
            if (!$db->fieldExists('design_number', 'products')) unset($data['design_number']);
            if (!$db->fieldExists('show_in_create_order', 'products')) unset($data['show_in_create_order']);
            $model->where('name', $name)->where('dealerid', (string)$dealer['id'])->update(null, $data);
            $updatedProducts[] = ['name' => $name, 'updated_fields' => array_keys($data)];
        }
        return $this->respond([
            'success'          => true,
            'message'          => 'Tally products processed successfully',
            'updated_products' => $updatedProducts,
            'errors'           => $errors,
        ]);
    }
    
    // In App\Controllers\ProductController.php (or a new ProxyController.php)

    public function proxyImage()
    {
        $url = $this->request->getGet('url');
        
        if (!$url) {
            return $this->response->setStatusCode(400)->setBody('Missing url');
        }
        
        // Security: only allow images from the host configured for this deployment.
        $allowed = parse_url(config('App')->baseURL, PHP_URL_HOST);
        $parsed  = parse_url($url);
        if (!$allowed || !isset($parsed['host']) || strcasecmp($parsed['host'], $allowed) !== 0) {
            return $this->response->setStatusCode(403)->setBody('Forbidden');
        }
    
        // Fetch the image server-side (no CORS issue here)
        $imageData = @file_get_contents($url);
        
        if ($imageData === false) {
            return $this->response->setStatusCode(404)->setBody('Image not found');
        }
    
        // Detect mime type
        $finfo    = new \finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->buffer($imageData) ?: 'image/jpeg';
    
        return $this->response
            ->setHeader('Access-Control-Allow-Origin', '*')
            ->setHeader('Cache-Control', 'public, max-age=86400')
            ->setHeader('Content-Type', $mimeType)
            ->setBody($imageData);
    }
}
