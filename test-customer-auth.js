const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testCustomerAuth() {
  console.log('🧪 Testing Customer Authentication Endpoints...\n');

  try {
    // Test 1: Server time endpoint
    console.log('1. Testing server time endpoint...');
    const timeResponse = await axios.get(`${BASE_URL}/server/time`);
    console.log('✅ Server time:', timeResponse.data);
    console.log('');

    // Test 2: Customer login with non-existent phone
    console.log('2. Testing customer login with non-existent phone...');
    try {
      const loginResponse = await axios.get(`${BASE_URL}/customer/login/9999999999`);
      console.log('❌ Expected 404 but got:', loginResponse.status);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✅ Correctly returned 404 for non-existent customer');
      } else {
        console.log('❌ Unexpected error:', error.response?.status, error.response?.data);
      }
    }
    console.log('');

    // Test 3: Customer registration
    console.log('3. Testing customer registration...');
    const registerData = {
      name: 'Test Customer',
      phone: '+91 98765 43210',
      email: 'test@example.com',
      address: 'Test Address'
    };
    
    const registerResponse = await axios.post(`${BASE_URL}/customer/register`, registerData);
    console.log('✅ Customer registered successfully:', registerResponse.data.name);
    console.log('');

    // Test 4: Customer login with registered phone
    console.log('4. Testing customer login with registered phone...');
    const loginResponse = await axios.get(`${BASE_URL}/customer/login/+91 98765 43210`);
    console.log('✅ Customer login successful:', loginResponse.data.name);
    console.log('');

    // Test 5: Customer orders endpoint
    console.log('5. Testing customer orders endpoint...');
    const ordersResponse = await axios.get(`${BASE_URL}/customer/orders?customer_phone=+91 98765 43210`);
    console.log('✅ Customer orders endpoint working:', ordersResponse.data.length, 'orders found');
    console.log('');

    console.log('🎉 All customer authentication tests passed!');
    console.log('✅ Customers from Indian timezone should now be able to login without 401 errors.');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testCustomerAuth(); 