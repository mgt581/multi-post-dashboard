// Test script to check authentication logic
window.addEventListener('DOMContentLoaded', function() {
  const email = localStorage.getItem('userEmail');
  if (!email) {
    console.log('User is not signed in.');
  } else {
    console.log('User is signed in as', email);
  }
});
