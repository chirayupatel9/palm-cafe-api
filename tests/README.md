# Integration tests

- Use a **separate test database** (e.g. `cafe_app_test`). Do not run tests against production.
- Create the test DB, then run migrations with test DB name, then run tests:

  ```bash
  # Create DB (e.g. in MySQL: CREATE DATABASE cafe_app_test;)
  # Then either:
  DB_NAME=cafe_app_test node run-migrations.js
  npm test
  # Or use TEST_DB_NAME:
  set TEST_DB_NAME=cafe_app_test
  npm test
  ```

- Coverage: `npm run test:coverage`
