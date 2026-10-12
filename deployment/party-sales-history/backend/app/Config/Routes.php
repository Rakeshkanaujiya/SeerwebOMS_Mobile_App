<?php

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */

$routes->get('/', 'Home::index');
require APPPATH . 'Config/TallyBridgeRoutes.php';

$routes->get('products/proxy-image', 'ProductController::proxyImage');

// ── Auth ──────────────────────────────────────────────────────────────────
$routes->post('login',           'AuthController::login');
$routes->post('auth/otp/request','AuthController::requestOtp');
$routes->post('auth/otp/verify', 'AuthController::verifyOtp');
$routes->post('register',        'AuthController::register');
$routes->get('validate-token',   'AuthController::validateToken', ['filter' => 'auth']);
$routes->post('change-password', 'RetailerController::changePassword');
$routes->get('users/check-unique',      'UserValidationController::checkUnique');
$routes->get('users/generate-username', 'UserValidationController::generateUsername');

// ── Attribute Options ─────────────────────────────────────────────────────
$routes->get('attribute-options',           'AttributeOptionsController::index');
$routes->post('attribute-options',          'AttributeOptionsController::create');
$routes->delete('attribute-options/(:num)', 'AttributeOptionsController::delete/$1');

// ── Custom Fields ─────────────────────────────────────────────────────────
$routes->get('custom-fields',           'CustomFieldsController::index');
$routes->post('custom-fields',          'CustomFieldsController::create');
$routes->put('custom-fields/(:num)',    'CustomFieldsController::update/$1');
$routes->delete('custom-fields/(:num)', 'CustomFieldsController::delete/$1');

// ── Dealers ───────────────────────────────────────────────────────────────
$routes->get('dealers/business-types/schema/(:num)', 'DealerController::schemaByType/$1');
$routes->get('dealers/business-types',               'DealerController::businessTypes');
$routes->get('dealers/count',                        'DealerCountController::index');
$routes->get('dealers/(:num)/users',                 'DealerController::users/$1');
$routes->get('dealers/(:num)/usage',                 'DealerController::usage/$1');
$routes->put('dealers/(:num)/user-limit',            'DealerController::updateLimit/$1');

$routes->group('dealer-product-schema', function ($routes) {
    $routes->get('', 'DealerProductSchemaController::index');
    $routes->get('/', 'DealerProductSchemaController::index');
    $routes->post('', 'DealerProductSchemaController::create');
    $routes->post('/', 'DealerProductSchemaController::create');
    $routes->put('(:num)', 'DealerProductSchemaController::update/$1');
    $routes->delete('(:num)', 'DealerProductSchemaController::delete/$1');
});

$routes->resource('dealers', [
    'controller' => 'DealerController'
]);

$routes->group('gst-slabs', function ($routes) {
    $routes->get('active', 'GstMasterController::active');
    $routes->get('', 'GstMasterController::index');
    $routes->get('/', 'GstMasterController::index');
    $routes->post('', 'GstMasterController::create');
    $routes->post('/', 'GstMasterController::create');
    $routes->put('(:num)', 'GstMasterController::update/$1');
    $routes->delete('(:num)', 'GstMasterController::delete/$1');
});

$routes->group('gst-settings', function ($routes) {
    $routes->get('active', 'GstMasterController::active');
    $routes->get('', 'GstMasterController::index');
    $routes->get('/', 'GstMasterController::index');
    $routes->post('', 'GstMasterController::create');
    $routes->post('/', 'GstMasterController::create');
    $routes->put('(:num)', 'GstMasterController::update/$1');
    $routes->delete('(:num)', 'GstMasterController::delete/$1');
});

$routes->group('product-field-settings', function ($routes) {
    $routes->get('', 'ProductFieldSettingsController::showByDealer');
    $routes->get('/', 'ProductFieldSettingsController::showByDealer');
    $routes->post('', 'ProductFieldSettingsController::save');
    $routes->post('/', 'ProductFieldSettingsController::save');
});

$routes->group('customer-creation-settings', function ($routes) {
    $routes->get('', 'CustomerCreationSettingsController::showByDealer');
    $routes->get('/', 'CustomerCreationSettingsController::showByDealer');
    $routes->post('', 'CustomerCreationSettingsController::save');
    $routes->post('/', 'CustomerCreationSettingsController::save');
});

$routes->group('product-list-settings', function ($routes) {
    $routes->get('', 'ProductListSettingsController::showByDealer');
    $routes->get('/', 'ProductListSettingsController::showByDealer');
    $routes->post('', 'ProductListSettingsController::save');
    $routes->post('/', 'ProductListSettingsController::save');
});

// ── Orders ────────────────────────────────────────────────────────────────
$routes->group('product-settings', function ($routes) {
    $routes->get('', 'ProductSettingsController::showByDealer');
    $routes->get('/', 'ProductSettingsController::showByDealer');
    $routes->post('', 'ProductSettingsController::save');
    $routes->post('/', 'ProductSettingsController::save');
});

$routes->group('orders', function ($routes) {

    // IMPORTANT:
    // Named routes should come before wildcard routes

    $routes->get('salesOrdersForTally', 'OrderController::salesOrdersForTally', ['filter' => 'tallyApiKey']);
    $routes->get('outstandings', 'OrderController::salesOrderOutstandings');

    $routes->get('dashboard', 'OrderController::dashboard');

    $routes->get('retailer-dashboard', 'OrderController::retailerDashboard');

    $routes->get('fordealer',   'OrderController::getOrdersByDealer');

    $routes->get('byexecutive', 'OrderController::getOrdersByExecutive');

    $routes->get('/',           'OrderController::getOrdersByRetailer');

    $routes->post('/',          'OrderController::create');

    $routes->put('(:num)',        'OrderController::update/$1');

    $routes->put('(:num)/status', 'OrderController::updateStatus/$1');

    $routes->delete('(:num)',     'OrderController::delete/$1');
});

// ── Retailers ─────────────────────────────────────────────────────────────
$routes->group('retailers', function ($routes) {

    $routes->get('for-tally', 'RetailerController::forTally', ['filter' => 'tallyApiKey']);

    $routes->get('check-duplicate', 'RetailerController::checkDuplicate');

    $routes->get('/', 'RetailerController::index');

    $routes->post('/', 'RetailerController::create');

    $routes->post('import', 'RetailerController::import');

    $routes->post('createfortally', 'RetailerController::createfortally', ['filter' => 'tallyApiKey']);

    $routes->post('import_ledger', 'RetailerController::import_ledger', ['filter' => 'tallyApiKey']);

    $routes->post('change-password', 'RetailerController::changePassword');

    $routes->put('(:num)', 'RetailerController::update/$1');

    $routes->delete('(:num)', 'RetailerController::delete/$1');
});

// ── Products ──────────────────────────────────────────────────────────────
$routes->get('stock_item/for-tally', 'ProductController::forTally', ['filter' => 'tallyApiKey']);

$routes->group('products', function ($routes) {

    $routes->get('', 'ProductController::index');

    $routes->get('sales-history', 'ProductController::salesHistory');

    $routes->post('/', 'ProductController::create');

    $routes->post('import', 'ProductController::import', ['filter' => 'tallyApiKey']);

    $routes->post('update/(:num)', 'ProductController::update/$1');

    $routes->post('(:num)/show-in-create-order', 'ProductController::updateShowInCreateOrder/$1');

    $routes->get('(:num)/delivered-order-usage', 'ProductController::deliveredOrderUsage/$1');

    $routes->get('(:num)', 'ProductController::show/$1');

    $routes->delete('(:num)', 'ProductController::delete/$1');
});

// ── Staff ─────────────────────────────────────────────────────────────────
$routes->group('staff', function ($routes) {

    $routes->get('sales_executive', 'StaffController::get_sales_executive');

    $routes->get(
        'get_retailers_by_executive',
        'StaffController::getRetailersByExecutive'
    );

    $routes->get('/', 'StaffController::index');

    $routes->get('(:num)', 'StaffController::show/$1');

    $routes->post('/', 'StaffController::create');

    $routes->put('(:num)', 'StaffController::update/$1');

    $routes->delete('(:num)', 'StaffController::delete/$1');
});

// ── Tally ─────────────────────────────────────────────────────────────────
$routes->put('product/updateFromTally', 'ProductController::updateFromTally', ['filter' => 'tallyApiKey']);

$routes->post('product/updateFromTally', 'ProductController::updateFromTally', ['filter' => 'tallyApiKey']);

$routes->delete(
    'product/deleteFromTally/(:num)',
    'ProductController::deleteFromTally/$1',
    ['filter' => 'tallyApiKey']
);

$routes->post('tallyproducts', 'TallyData::products', ['filter' => 'tallyApiKey']);

$routes->post('tally/register-bridge', 'TallyController::registerBridge');
$routes->post('tally/master-status', 'TallyMasterSyncController::status', ['filter' => 'tallyApiKey']);
$routes->post('tally/master-mark', 'TallyMasterSyncController::mark', ['filter' => 'tallyApiKey']);

$routes->group('tally', function ($routes) {

    $routes->get('pending', 'TallyController::pendingOrders', ['filter' => 'tallyApiKey']);

    $routes->get('orders', 'TallyController::orders', ['filter' => 'tallyApiKey']);

    $routes->post('claim', 'TallyController::claim', ['filter' => 'tallyApiKey']);

    $routes->get('dealers', 'TallyController::dealers', ['filter' => 'tallyApiKey']);

    $routes->get('get_dealerid', 'TallyController::getMyDealer', ['filter' => 'tallyApiKey']);

    $routes->post('mark-synced', 'TallyController::markSynced', ['filter' => 'tallyApiKey']);

    $routes->post('mark-failed', 'TallyController::markFailed', ['filter' => 'tallyApiKey']);
});

// ── Misc ──────────────────────────────────────────────────────────────────
$routes->get('states', 'StateController::index');

$routes->post('voice/transcribe', 'Voice::transcribe', ['filter' => 'auth']);
