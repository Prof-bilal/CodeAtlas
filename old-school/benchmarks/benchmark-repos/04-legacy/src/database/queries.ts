// Database queries - OLD
// DEPRECATED - use repositories

export const queries = {
  findUserByEmail: 'SELECT * FROM users WHERE email = ',
  findUserByUsername: 'SELECT * FROM users WHERE username = ',
  createUser: 'INSERT INTO users (username, email, password) VALUES (, , )',
  updateUser: 'UPDATE users SET  =  WHERE id = ',
  deleteUser: 'DELETE FROM users WHERE id = ',

  findPaymentById: 'SELECT * FROM payments WHERE id = ',
  findPaymentsByUser: 'SELECT * FROM payments WHERE user_id = ',
  createPayment: 'INSERT INTO payments (user_id, amount, currency) VALUES (, , )',
  updatePaymentStatus: 'UPDATE payments SET status =  WHERE id = ',

  // TODO: these queries are not parameterized properly
  searchUsers: 'SELECT * FROM users WHERE username LIKE \\'%%\\'',
  getUserStats: 'SELECT COUNT(*) FROM users WHERE role = \\'user\\'',
};
