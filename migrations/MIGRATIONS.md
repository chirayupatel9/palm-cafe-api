# Database migrations

## Running migrations

- **Fresh install:** Run `database_full_schema.sql` once (creates all tables). Do not run `run-migrations.js` for a brand-new database unless you need incremental steps.
- **Existing database:** Run `node run-migrations.js` to apply migrations 001–029 in order. Executed migrations are recorded in the `migrations` table.

## Rollback (down migrations)

Migrations do not have an automated rollback runner. Rollback is **manual**:

1. **Document:** Each migration that supports rollback exports a `down()` function (e.g. `migration-029-add-categories-unique.js`). See the migration file for the exact steps.
2. **Run manually:** If you need to undo a migration, call the migration’s `down()` from a one-off script or Node REPL, then remove the corresponding row from the `migrations` table so the migration can be re-run if needed.
3. **Example (029):** To roll back the categories unique index:
   ```js
   const { down } = require('./migrations/migration-029-add-categories-unique');
   await down();
   // Then: DELETE FROM migrations WHERE migration_name = '029-add-categories-unique';
   ```

Many migrations (e.g. table creation, multi-cafe support) do not export `down()` because reversing them is complex or would lose data. For those, treat rollback as manual schema/data changes and document any procedure in this file or in the migration.

## Order and naming

- Migrations are ordered in `run-migrations.js` (`MIGRATION_ORDER`).
- File names: `migration-NNN-description.js` (e.g. `migration-029-add-categories-unique.js`).
- Each module must export a runnable function (e.g. `runMigration`, `addCategoriesUniqueMigration`, or the pattern used by existing migrations). See `getMigrationRun()` in `run-migrations.js`.
