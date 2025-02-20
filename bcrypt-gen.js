// bcrypt-gen.js
const bcrypt = require('bcryptjs');

(async () => {
  const salt = await bcrypt.genSalt(10);
  const hashed = await bcrypt.hash("admin1234", salt);
  console.log("Hash generado:", hashed);
})();
