package uk.co.multipostapp

import android.app.Activity
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.GetBillingConfigParams
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

    private var details: Map<String, ProductDetails> = emptyMap()
    private var playCountryCode: String? = null
    private var ready = false
    private var connecting = false
    private var restoreOnConnect = false
    @Volatile private var workspaceCheckoutInProgress = false

    fun start() {
        if (ready || connecting) return
        connecting = true
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                connecting = false
                ready = result.responseCode == BillingClient.BillingResponseCode.OK
                if (ready) {
                    queryPlans()
                    if (restoreOnConnect) { restoreOnConnect = false; restore() }
                } else error("Google Play Billing is unavailable")
            }
            override fun onBillingServiceDisconnected() { ready = false; connecting = false }
        })
    }

    fun queryPlans() {
        if (!ready) { start(); return }
        // Refresh must retry region detection too, and replay it for each page.
        client.getBillingConfigAsync(GetBillingConfigParams.newBuilder().build()) { result, config ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                playCountryCode = config?.countryCode
            }
            sendToPage("onMultiPostPlayCountry", JSONObject.quote(playCountryCode ?: ""))
            queryProductPlans()
        }
    }

    private fun queryProductPlans() {
        val products = (listOf(PRODUCT_ID) + WORKSPACE_PRODUCT_IDS).map { productId ->
            QueryProductDetailsParams.Product.newBuilder().setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS).build()
        }
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(products).build()) { result, queried ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) { error("Plans unavailable"); return@queryProductDetailsAsync }
            details = queried.productDetailsList.associateBy { it.productId }
            val plans = JSONArray()
            for (offer in details[PRODUCT_ID]?.subscriptionOfferDetails.orEmpty()) {
                if (offer.basePlanId !in BASE_PLANS) continue
                val phases = offer.pricingPhases.pricingPhaseList
                val paid = phases.lastOrNull()
                plans.put(JSONObject().put("base_plan_id", offer.basePlanId)
                    .put("price", paid?.formattedPrice ?: "")
                    .put("trial_available", offer.hasSevenDayTrial())
                    .put("offer_id", offer.offerId))
            }
            sendToPage("onMultiPostPlayPlans", plans.toString())
            val workspacePlans = JSONArray()
            if (playCountryCode != null && playCountryCode != "KR") for (id in WORKSPACE_PRODUCT_IDS) {
                val item = details[id] ?: continue
                for (offer in item.subscriptionOfferDetails.orEmpty()) {
                    if (offer.basePlanId !in BASE_PLANS || offer.offerId != null) continue
                    workspacePlans.put(JSONObject().put("product_id", id)
                        .put("base_plan_id", offer.basePlanId)
                        .put("price", offer.pricingPhases.pricingPhaseList.lastOrNull()?.formattedPrice ?: ""))
                }
            }
            sendToPage("onMultiPostWorkspacePlans", workspacePlans.toString())
        }
    }

    fun purchase(basePlanId: String, firebaseUid: String) {
        if (!ready || firebaseUid.isBlank() || basePlanId !in BASE_PLANS) { error("Sign in and select a plan"); return }
        val product = details[PRODUCT_ID] ?: run { queryPlans(); error("Plans are loading"); return }
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

    /** All products in a change share the verified Pro period and one Play purchase token. */
    fun changeWorkspaces(target: Int, interval: String, firebaseUid: String, renewingIds: List<String>, ownedIds: List<String>) {
        if (workspaceCheckoutInProgress) return
        if (!ready || playCountryCode == null || playCountryCode == "KR" || target !in 0..9 ||
            interval !in BASE_PLANS || firebaseUid.isBlank() || renewingIds.distinct().size != renewingIds.size ||
            ownedIds.distinct().size != ownedIds.size || renewingIds.any { it !in WORKSPACE_PRODUCT_IDS } ||
            ownedIds.any { it !in WORKSPACE_PRODUCT_IDS } || renewingIds.any { it !in ownedIds }) {
            error("Workspace purchase is unavailable for this account or region"); return
        }
        workspaceCheckoutInProgress = true
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()) { result, purchases ->
            val current = purchases.singleOrNull { PRODUCT_ID in it.products && it.purchaseState == Purchase.PurchaseState.PURCHASED }
            if (result.responseCode != BillingClient.BillingResponseCode.OK || current == null ||
                renewingIds.any { it !in current.products }) { error("Restore your Pro purchase before changing workspaces"); return@queryPurchasesAsync }
            val active = current.products.filter { it in WORKSPACE_PRODUCT_IDS }
            if (active.toSet() != ownedIds.toSet()) {
                error("Your workspace purchase status changed. Tap Refresh and try again")
                return@queryPurchasesAsync
            }
            val desired = renewingIds.take(target).toMutableList()
            // A scheduled removal is still paid. KEEP_EXISTING must not be
            // mistaken for re-enabling renewal on that same product.
            for (id in WORKSPACE_PRODUCT_IDS.filter { it !in active }) {
                if (desired.size >= target) break
                desired.add(id)
            }
            if (desired.size != target) {
                error("All nine extra workspace places are in use until a scheduled removal expires"); return@queryPurchasesAsync
            }
            if (desired.size == renewingIds.size && desired.toSet() == renewingIds.toSet()) {
                error("No workspace change is needed"); return@queryPurchasesAsync
            }
            val selected = listOf(PRODUCT_ID) + desired
            // Offer tokens can go stale while the settings page stays open. Get
            // fresh ProductDetails for the exact cart before opening checkout.
            val request = QueryProductDetailsParams.newBuilder().setProductList(selected.map { id ->
                QueryProductDetailsParams.Product.newBuilder().setProductId(id)
                    .setProductType(BillingClient.ProductType.SUBS).build()
            }).build()
            client.queryProductDetailsAsync(request) { planResult, queried ->
                if (planResult.responseCode != BillingClient.BillingResponseCode.OK) {
                    error("Could not refresh workspace offers (${playError(planResult)})")
                    return@queryProductDetailsAsync
                }
                val freshDetails = queried.productDetailsList.associateBy { it.productId }
                val params = selected.map { id ->
                    val product = freshDetails[id] ?: run {
                        error("Workspace plan $id is unavailable in Google Play")
                        return@queryProductDetailsAsync
                    }
                    val builder = BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(product)
                    if (id in current.products) {
                        // KEEP_EXISTING retains the current offer. Play rejects
                        // an offer token on a retained product (response code 5).
                        builder.setSubscriptionProductReplacementParams(
                            BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.newBuilder()
                                .setOldProductId(id)
                                .setReplacementMode(BillingFlowParams.ProductDetailsParams.SubscriptionProductReplacementParams.ReplacementMode.KEEP_EXISTING)
                                .build())
                    } else {
                        val offer = product.subscriptionOfferDetails.orEmpty().firstOrNull {
                            it.basePlanId == interval && it.offerId == null
                        } ?: run {
                            error("A matching $interval workspace plan is unavailable")
                            return@queryProductDetailsAsync
                        }
                        builder.setOfferToken(offer.offerToken)
                    }
                    builder.build()
                }
                val accountHash = MessageDigest.getInstance("SHA-256")
                    .digest("multipost:$firebaseUid".toByteArray(Charsets.UTF_8))
                    .joinToString("") { "%02x".format(it) }
                val flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(params)
                    .setSubscriptionUpdateParams(BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                        .setOldPurchaseToken(current.purchaseToken).build())
                    .setObfuscatedAccountId(accountHash).build()
                val launch = client.launchBillingFlow(activity, flow)
                if (launch.responseCode != BillingClient.BillingResponseCode.OK)
                    error("Could not open the workspace purchase (${playError(launch)})")
            }
        }
    }

    fun restore() {
        if (!ready) { restoreOnConnect = true; start(); return }
        val params = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        client.queryPurchasesAsync(params) { result, purchases ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                purchases.forEach(::deliverPurchase)
                if (purchases.isEmpty()) error("No Google Play subscription found")
            } else error("Could not restore Google Play purchases")
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        workspaceCheckoutInProgress = false
        if (result.responseCode == BillingClient.BillingResponseCode.OK) purchases.orEmpty().forEach(::deliverPurchase)
        else if (result.responseCode != BillingClient.BillingResponseCode.USER_CANCELED)
            error("Google Play purchase was not completed (${playError(result)})")
    }

    private fun deliverPurchase(purchase: Purchase) {
        if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED || PRODUCT_ID !in purchase.products) return
        // The page sends the token to our backend with its Firebase ID token.
        // Initial purchase acknowledgment is performed only after server verification.
        sendToPage("onMultiPostPlayPurchase", JSONObject().put("purchase_token", purchase.purchaseToken).toString())
    }

    private fun error(message: String) {
        workspaceCheckoutInProgress = false
        sendToPage("onMultiPostPlayError", JSONObject.quote(message))
    }
    private fun playError(result: BillingResult): String =
        "Play code ${result.responseCode}${result.debugMessage.takeIf { it.isNotBlank() }?.let { ": $it" } ?: ""}"
    fun close() = client.endConnection()

    private fun ProductDetails.SubscriptionOfferDetails.hasSevenDayTrial(): Boolean =
        offerId == "trial-7d-$basePlanId" &&
            pricingPhases.pricingPhaseList.any { it.priceAmountMicros == 0L && it.billingPeriod == "P1W" }

    private companion object {
        const val PRODUCT_ID = "multipost_pro"
        val WORKSPACE_PRODUCT_IDS = (1..10).map { "multipost_workspace_%02d".format(it) }
        val BASE_PLANS = setOf("monthly", "yearly")
    }
}
