// Old Stripe helper - DO NOT USE
// This was the original Stripe integration before we created proper services
// Uses old Stripe SDK version

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_old_key');

// WARNING: This uses callbacks, not promises
// DO NOT USE in new code

function createCharge(amount, currency, description, callback) {
  stripe.charges.create({
    amount: amount * 100,
    currency: currency || 'usd',
    description: description || 'Payment',
  }, function(err, charge) {
    if (err) {
      console.error('Stripe charge error:', err);
      return callback(err, null);
    }
    callback(null, charge);
  });
}

function createCustomer(email, name, callback) {
  stripe.customers.create({
    email: email,
    name: name,
  }, function(err, customer) {
    if (err) {
      return callback(err, null);
    }
    callback(null, customer);
  });
}

function createSubscription(customerId, priceId, callback) {
  stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
  }, function(err, subscription) {
    if (err) {
      return callback(err, null);
    }
    callback(null, subscription);
  });
}

function refundCharge(chargeId, amount, callback) {
  stripe.refunds.create({
    charge: chargeId,
    amount: amount ? amount * 100 : undefined,
  }, function(err, refund) {
    if (err) {
      return callback(err, null);
    }
    callback(null, refund);
  });
}

function listCharges(customerId, limit, callback) {
  stripe.charges.list({
    customer: customerId,
    limit: limit || 10,
  }, function(err, charges) {
    if (err) {
      return callback(err, null);
    }
    callback(null, charges.data);
  });
}

// TODO: this function doesn't handle errors properly
function createInvoice(customerId, callback) {
  stripe.invoices.create({
    customer: customerId,
  }, function(err, invoice) {
    callback(err, invoice);
  });
}

module.exports = {
  createCharge,
  createCustomer,
  createSubscription,
  refundCharge,
  listCharges,
  createInvoice,
};
