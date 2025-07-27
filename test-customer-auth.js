const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testCustomerAuth() {
  try {
    // Test 1: Server time endpoint
    const timeResponse = await axios.get(`${BASE_URL}/server/time`);

    // Test 2: Customer login with non-existent phone
    try {
      const loginResponse = await axios.get(`${BASE_URL}/customer/login/9999999999`);
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Unexpected error:', error.response?.status, error.response?.data);
      }
    }

    // Test 3: Customer registration
    const registerData = {
      name: 'Test Customer',
      phone: '+91 98765 43210',
      email: 'test@example.com',
      address: 'Test Address'
    };
    
    const registerResponse = await axios.post(`${BASE_URL}/customer/register`, registerData);

    // Test 4: Customer login with registered phone
    const loginResponse = await axios.get(`${BASE_URL}/customer/login/+91 98765 43210`);

    // Test 5: Customer orders endpoint
    const ordersResponse = await axios.get(`${BASE_URL}/customer/orders?customer_phone=+91 98765 43210`);

  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testCustomerAuth(); 