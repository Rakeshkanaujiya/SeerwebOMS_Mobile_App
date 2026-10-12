# Party Sales History Deployment And Verification

## Findings (2026-09-26 IST)

Production GET https://oms.seerweberp.com/api/products/sales-history?dealerid=22363&retailer_id=36724
returned HTTP 404, Content-Type application/json; charset=UTF-8, body `""`.
The direct `/backend/public/products/sales-history` URL returned the same result.
These were unauthenticated route probes. The checked-in handler would return
HTTP 401 JSON for this request without a token, not 404. The deployed route or
controller is therefore unavailable/outdated; remote source inspection is still
needed to identify exactly which deployed file is stale.

Both local_backend and live_backend ALREADY contained the named route and
salesHistory method before this fix. Their ProductController files were identical.
Their Routes files differ in unrelated Tally/voice routes, not sales history.
The package uses live_backend Routes.php to preserve those differences.
Do not assume editing live_backend on this computer deploys Production.

## Complete Request Flow

StaffScreen's selected-customer effect calls src/lib/partyProductHistory.ts,
which sends a bearer-authenticated request to the URL above. The web app's
client/src/lib/partyProductHistory.ts uses exactly the same contract:
`dealerid` and `retailer_id`, returning a product-ID map of quantity/order_count.
There is no alternate web endpoint to substitute.

CodeIgniter app/Config/Routes.php registers GET products/sales-history to
ProductController::salesHistory before the numeric product route. The controller
uses the CodeIgniter database query builder directly (not ProductModel): it checks
the JWT actor in users, verifies dealer/staff tenant ownership and retailer
membership, then joins order_items to orders, scopes both dealer and retailer,
excludes cancelled orders, sums quantities and counts distinct orders per product.
Valid customers without orders receive HTTP 200 `{}`. Wrong-tenant customers
remain HTTP 404 JSON; unauthorized tenant/role access remains HTTP 403 JSON.
Database query failures remain HTTP 500 JSON and are logged.

## Changes

- Both backend ProductController.php copies explicitly select JSON in salesHistory.
- Mobile partyProductHistory.ts rejects empty/malformed successful responses,
  preserves HTTP failures and diagnostics, and prevents an in-flight response
  repopulating history cache after order submission, matching the web revision guard.
- StaffScreen already loads products independently of optional history and logs
  failures while using default sorting. This behavior is preserved.
- Ranking is unchanged: quantity descending, distinct orders descending, then
  brand, product type, product name and ID. No Garment/Mobile/Dairy UI was changed.

## Exact Backend Destinations

The user confirmed the live CodeIgniter root as
`/home4/seerwgqg/oms.seerweberp.com/backend`. Exact cPanel destinations:

| Packaged source | Absolute cPanel destination |
| --- | --- |
| backend/app/Config/Routes.php | /home4/seerwgqg/oms.seerweberp.com/backend/app/Config/Routes.php |
| backend/app/Controllers/ProductController.php | /home4/seerwgqg/oms.seerweberp.com/backend/app/Controllers/ProductController.php |

Equivalently, under the repository's documented domain folder:
`oms.seerweberp.com/backend/app/Config/Routes.php` and
`oms.seerweberp.com/backend/app/Controllers/ProductController.php`.
Do NOT upload these files into api/, backend/public/app/, or a mobile directory.

1. Back up these two server files. Compare them with the package before replacing
   them, since remote changes cannot be checked without deployment access.
2. Deploy both files from oms-party-sales-history-backend.zip together. If the
   server has newer unrelated changes, merge only the named GET route and the
   salesHistory method; it also requires the existing currentActor helper and JWT
   imports in ProductController. The route is:
   `$routes->get('sales-history', 'ProductController::salesHistory');`
   inside the existing products group, before wildcard routes.
3. If PHP OPcache retains the old files, reload PHP through the hosting controls.
4. An unauthenticated GET with valid parameters must now return HTTP 401 JSON,
   not 404. Never remove authentication to make the probe return 200.
5. Run the authenticated Production verification below, then rebuild/install the
   mobile application and verify StaffScreen with the selected customer.

No schema migration, database reset, or frontend web deployment is required.

## Verified Locally

Both backend copies: 5 tests / 12 assertions passed using real CodeIgniter routes,
controller and isolated in-memory SQLite fixtures. Dealer 22363/customer 36724
fixture returned HTTP 200 `{"101":{"quantity":7.5,"order_count":2}}`.
The separate no-history fixture returned HTTP 200 `{}`. Tests also cover staff
access, foreign tenants, retailer role rejection, wrong parameters, authentication,
cancelled orders, duplicate product lines and genuine HTTP 500 database failures.
These fixtures are NOT evidence of this customer's actual Production orders.

Mobile: 4 service/sorting tests passed, including web contract parity, empty history,
malformed responses, 404/500 propagation, deduplication and cache invalidation.
The actual mobile/web sorting functions produce identical results. Product loading
is independent by StaffScreen code inspection; no native device session was tested.
TypeScript passed with `--ignoreDeprecations 5.0`; plain tsc is blocked by the
repository's pre-existing incompatible ignoreDeprecations option.

From SeerwebOMS:

```powershell
node --test .verification/party-history.test.cjs
node node_modules/typescript/bin/tsc --noEmit --ignoreDeprecations 5.0
```

From each backend directory:

```powershell
C:/xampp/php/php.exe -d extension=sqlite3 vendor/bin/phpunit ../local_backend/tests/unit/PartySalesHistoryTest.php --no-coverage
```

## Production Acceptance Still Required

The user authorized SSH deployment, but connection details are pending: the
accessible Windows profile has no .ssh directory, no SSH agent, and no saved
PuTTY session. A batch SSH attempt to seerwgqg@oms.seerweberp.com stopped at host
key verification, before authentication. No live files have been modified and
no live backups have been created yet. Compare remote files and back up every
file before applying a scoped change once the connection is available.
Production deployment, authenticated HTTP 200 responses, actual order totals
and native StaffScreen behavior remain unverified, not passed.

Set OMS_TEST_TOKEN privately to an existing dealer/staff bearer token for dealer
22363. Set OMS_EMPTY_RETAILER_ID to an existing customer of that dealer verified
to have no orders. From SeerwebOMS run:

```powershell
node .verification/verify-production-history.cjs
```

The script checks the exact requested customer, the no-history customer and product
loading against Production; it never persists or prints the token. Verify actual
quantity and distinct-order totals against orders/order_items in Production,
using the same dealer, retailer and cancelled-status conditions above.
On a native device select customer 36724 as dealer 22363's staff: confirm products
load, history ranking matches the web app, and no PartyProductHistoryError occurs.
Then select the verified no-history customer and confirm normal fallback sorting.
