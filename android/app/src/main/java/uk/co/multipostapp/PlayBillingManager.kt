package uk.co.multipostapp

import android.app.Activity
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest

/** The server, never this client, decides whether a purchase grants access. */
class PlayBillingManager(
    private val activity: Activity,
    private val sendToPage: (String, String) -> Unit
) : PurchasesUpdatedListener {
    private val client = BillingClient.newBuilder(activity)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    private var details: ProductDetails? = null
    private var ready = false

    fun start() {
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                ready = result.responseCode == BillingClient.BillingResponseCode.OK
                if (ready) queryPlans() else error("Google Play Billing is unavailable")
            }
            override fun onBillingServiceDisconnected() { ready = false }
        })
    }

    fun queryPlans() {
        if (!ready) { start(); return }
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PRODUCT_ID)
            .setProductType(BillingClient.ProductType.SUBS)
            .build()
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()) { result, queried ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) { error("Plans unavailable"); return@queryProductDetailsAsync }
            details = queried.productDetailsList.firstOrNull { it.productId == PRODUCT_ID }
            val plans = JSONArray()
            for (offer in details?.subscriptionOfferDetails.orEmpty()) {
                if (offer.basePlanId !in BASE_PLANS) continue
                val phases = offer.pricingPhases.pricingPhaseList
                val paid = phases.lastOrNull()
                plans.put(JSONObject().put("base_plan_id", offer.basePlanId)
                    .put("price", paid?.formattedPrice ?: "")
                    .put("trial_available", offer.hasSevenDayTrial())
                    .put("offer_id", offer.offerId))
            }
            sendToPage("onMultiPostPlayPlans", plans.toString())
        }
    }

    fun purchase(basePlanId: String, firebaseUid: String) {
        if (!ready || firebaseUid.isBlank() || basePlanId !in BASE_PLANS) { error("Sign in and select a plan"); return }
        val product = details ?: run { queryPlans(); error("Plans are loading"); return }
        val offers = product.subscriptionOfferDetails.orEmpty().filter { it.basePlanId == basePlanId }
        // Play returns only offers this user can purchase. Prefer an eligible trial offer.
        val offer = offers.firstOrNull { it.hasSevenDayTrial() } ?: offers.firstOrNull { it.offerId == null }
        if (offer == null) { error("This plan is unavailable"); return }
        val params = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(product).setOfferToken(offer.offerToken).build()
        val accountHash = MessageDigest.getInstance("SHA-256")
            .digest("multipost:$firebaseUid".toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val flow = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(params))
            .setObfuscatedAccountId(accountHash)
            .build()
        val result = client.launchBillingFlow(activity, flow)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) error("Could not open Google Play purchase")
    }

    fun restore() {
        if (!ready) { start(); return }
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        client.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                purchases.forEach(::deliverPurchase)
                if (purchases.isEmpty()) error("No Google Play subscription found")
            } else error("Could not restore Google Play purchases")
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK) purchases.orEmpty().forEach(::deliverPurchase)
        else if (result.responseCode != BillingClient.BillingResponseCode.USER_CANCELED) error("Google Play purchase was not completed")
    }

    private fun deliverPurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED || PRODUCT_ID !in purchase.products) return
        // The page sends the token to our backend with its Firebase ID token.
        // Initial purchase acknowledgment is performed only after server verification.
        sendToPage("onMultiPostPlayPurchase", JSONObject().put("purchase_token", purchase.purchaseToken).toString())
    }

    private fun error(message: String) = sendToPage("onMultiPostPlayError", JSONObject.quote(message))
    fun close() = client.endConnection()

    private fun ProductDetails.SubscriptionOfferDetails.hasSevenDayTrial(): Boolean =
        offerId != null && pricingPhases.pricingPhaseList.any { it.priceAmountMicros == 0L && it.billingPeriod == "P1W" }

    private companion object {
        const val PRODUCT_ID = "multipost_pro"
        val BASE_PLANS = setOf("monthly", "yearly")
    }
}
