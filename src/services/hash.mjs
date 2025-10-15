import bcrypt from 'bcrypt';

const password = 'SIBOL12345';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(hash);
});