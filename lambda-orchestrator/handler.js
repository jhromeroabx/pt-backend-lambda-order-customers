const { createAndConfirm } = require('./src/orchestrate');

module.exports.createAndConfirm = async (event) => {
  return createAndConfirm(event);
};
