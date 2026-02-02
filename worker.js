import "./otherModule.js";

export default {
  // worker configuration
  name: "someWorker",
  // other configurations
};

// rest of the file
try {
  // worker logic
} catch (error) {
  console.error(error);
}
