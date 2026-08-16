// Database seed file
// DEPRECATED - contains test data

export const seedData = {
  users: [
    { username: 'admin', email: 'admin@test.com', role: 'admin' },
    { username: 'user1', email: 'user1@test.com', role: 'user' },
    { username: 'user2', email: 'user2@test.com', role: 'user' },
  ],
  products: [
    { name: 'Basic Plan', price: 9.99 },
    { name: 'Pro Plan', price: 29.99 },
    { name: 'Enterprise Plan', price: 99.99 },
  ],
};

// WARNING: This seeds the production database if run accidentally
export async function seed(db: any) {
  console.log('Seeding database...');
  // ... seed implementation
}
