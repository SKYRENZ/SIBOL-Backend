import bcrypt from 'bcrypt';

const password = process.env.DEFAULT_PASSWORD || 'SIBOL12345';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(hash);
});