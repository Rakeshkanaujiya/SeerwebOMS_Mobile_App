# OMS Web ↔ React Native feature-gap audit

Audited from the current sources in `seerweb OMS/client` and `seerweb OMS/SeerwebOMS` on 2026-09-24.

| Web behavior | Mobile behavior before this parity pass | Gap / action |
|---|---|---|
| Password login, token validation, role routing | Implemented, including profile refresh and role routing | Keep; verify dealer, staff, and retailer sessions. |
| Staff create-customer and create-product permissions | Implemented and hydrated from the current user/staff APIs | Keep; permission controls already hide/block unauthorized actions. |
| Customer creation settings, required fields, custom fields, duplicate check | Implemented in `CreateCustomerScreen` and `src/lib/customers.ts` | Keep and test create + duplicate validation. Customer editing remains a separate management-screen gap. |
| Item Master create/edit with dealer schema and Garment variants | Implemented in `CreateItemMasterScreen`; product cards retain Mobile/Garment variants | Keep; verify business IDs 1 and 2. |
| Dairy/FMCG simplified card and Excel import only for business type 3 | Mobile card branches and import are already scoped to `business_type_id === 3` | Keep the scope; do not leak the simplified UI into Mobile/Garment. |
| Customer selection restores only a customer that still exists | Mobile restored the serialized customer object after an ID-only check | Replace it with the fresh API customer object and clear stale storage. |
| Customers and products load independently | Mobile used one `Promise.all`; either failure prevented both lists from being applied | Use independent results so a product failure cannot erase customers and a customer failure cannot erase products. |
| Customer-wise product ranking: quantity, order count, then Brand → Product Type → Product Name | Missing from mobile staff/dealer Create Order | Add the current `/products/sales-history` client, cache/deduplication/race protection, and identical fallback sorting. |
| Empty customer history is valid | Missing because history was not requested | Normalize `[]`, `{}`, and empty history to `{}` without an alert. |
| Optional history failure never blocks ordering | Missing | Log endpoint/status/body for developers, apply a retry cooldown, and continue with default sorting without an alert. |
| Rapid customer switching cannot apply stale history | Missing | Associate history with the selected customer and ignore superseded responses. |
| Customer/product API failures retain useful technical details | Shared API logged status/body, but screen loading coupled both resources | Preserve structured logs and render concise resource-specific errors. |
| Cart quantities, product snapshots, variants, Garment size/color/size sets | Implemented in `CartContext`, `ProductCart`, and `src/lib/cart.ts` | Keep and regression-test. |
| GST slab lookup, tax snapshots, subtotal/GST/grand total | Implemented in `src/lib/gst.ts`, `src/lib/order.ts`, and both carts | Keep and verify payload parity. |
| Staff/dealer order payload includes retailer, dealer, actor, notes, GST and snapshots | Implemented | Add history-cache invalidation after successful create/update and improve visible critical submit errors. |
| Retailer ordering, cart, order list/status, edit/delete/share | Implemented | Keep and regression-test. |
| Dealer/staff dashboard and date/status reporting | Implemented | Keep and regression-test. |
| Web-only large administration pages: staff roster management, dealer schema/settings editors, custom-field/settings designers | No equivalent full editing screens in mobile | These are configuration-heavy desktop workflows. Mobile consumes their resulting permissions/schemas/settings. They remain web-admin workflows; duplicating them would require new mobile information architecture rather than ordering parity. |

## Parity scope implemented in this pass

1. Customer-history ranking and safe empty/error fallback.
2. Independent customer/product loading and stale-selection reconciliation.
3. Business-type-safe product ordering behavior.
4. Staff cart API authentication, visible critical submit errors, and history invalidation.
5. API/payload/build checks for business types 1, 2, and 3.
