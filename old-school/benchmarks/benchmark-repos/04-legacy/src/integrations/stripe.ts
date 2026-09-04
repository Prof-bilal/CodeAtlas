// Stripe integration - OLD
// DEPRECATED - use paymentServiceV2.ts

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = {
  charges: {
    create: (params) => stripe.charges.create(params),
    retrieve: (id) => stripe.charges.retrieve(id),
  },
  customers: {
    create: (params) => stripe.customers.create(params),
    retrieve: (id) => stripe.customers.retrieve(id),
  },
  refunds: {
    create: (params) => stripe.refunds.create(params),
  },
};
