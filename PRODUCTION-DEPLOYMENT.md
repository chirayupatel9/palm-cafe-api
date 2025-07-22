# Production Deployment Guide

## 🚀 Safe Database Migration Strategies

### **1. Automatic Migrations (Recommended)**

The application now includes automatic database migrations that run on startup:

```bash
# The server will automatically run migrations on startup
npm start
```

### **2. Manual Migration Commands**

```bash
# Run migrations manually
npm run migrate

# Check migration status
npm run migrate:status
```

### **3. Production Deployment Steps**

#### **Step 1: Backup Your Database**
```bash
# Create a backup before any changes
mysqldump -u [username] -p [database_name] > backup_$(date +%Y%m%d_%H%M%S).sql
```

#### **Step 2: Deploy New Code**
```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Run migrations (optional - will run automatically on startup)
npm run migrate
```

#### **Step 3: Restart Application**
```bash
# Restart the application
pm2 restart palm-cafe-api
# or
systemctl restart palm-cafe-api
```

### **4. Migration Safety Features**

- ✅ **Idempotent**: Migrations can be run multiple times safely
- ✅ **Tracked**: Each migration is recorded in the `migrations` table
- ✅ **Rollback Ready**: Each migration can be reversed if needed
- ✅ **Non-Destructive**: Migrations only add, never drop data

### **5. Emergency Rollback**

If a migration causes issues:

```bash
# Stop the application
pm2 stop palm-cafe-api

# Restore from backup
mysql -u [username] -p [database_name] < backup_20231201_143022.sql

# Restart with previous version
pm2 start palm-cafe-api
```

### **6. Monitoring Migrations**

Check migration status:
```sql
SELECT * FROM migrations ORDER BY executed_at DESC;
```

### **7. Environment Variables**

Ensure these are set in production:
```bash
DB_HOST=your-production-db-host
DB_USER=your-production-db-user
DB_PASSWORD=your-production-db-password
DB_NAME=your-production-db-name
```

### **8. Zero-Downtime Deployment**

For zero-downtime deployments:

1. **Deploy to staging first**
2. **Test migrations on staging**
3. **Create production backup**
4. **Deploy to production during low-traffic hours**
5. **Monitor application logs**
6. **Have rollback plan ready**

### **9. Migration Best Practices**

- ✅ Always backup before migrations
- ✅ Test migrations on staging first
- ✅ Deploy during maintenance windows
- ✅ Monitor application after deployment
- ✅ Keep migration scripts in version control
- ✅ Document any manual steps required

### **10. Troubleshooting**

#### **Migration Fails**
```bash
# Check migration logs
tail -f /var/log/palm-cafe-api.log

# Check database connection
mysql -u [username] -p -h [host] [database]

# Verify migration table
SELECT * FROM migrations;
```

#### **Application Won't Start**
```bash
# Check if migrations are blocking startup
npm run migrate:status

# Manual migration if needed
npm run migrate
```

### **11. Production Checklist**

- [ ] Database backup created
- [ ] Environment variables configured
- [ ] Dependencies installed
- [ ] Migrations tested on staging
- [ ] Application logs monitored
- [ ] Rollback plan prepared
- [ ] Team notified of deployment
- [ ] Post-deployment testing scheduled

---

## 🔧 Alternative Migration Strategies

### **Option 1: Manual SQL Scripts**
```sql
-- Add payment_method column
ALTER TABLE invoices ADD COLUMN payment_method ENUM('cash', 'card', 'upi', 'online') DEFAULT 'cash';

-- Create invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL,
  menu_item_id VARCHAR(36) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (invoice_number) REFERENCES invoices(invoice_number) ON DELETE CASCADE
);

-- Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100) NOT NULL,
  quantity DECIMAL(10,3) NOT NULL DEFAULT 0,
  unit VARCHAR(50) NOT NULL,
  cost_per_unit DECIMAL(10,2) DEFAULT NULL,
  supplier VARCHAR(200) DEFAULT NULL,
  reorder_level DECIMAL(10,3) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### **Option 2: Database Management Tools**
- Use tools like **Liquibase**, **Flyway**, or **db-migrate**
- Provides rollback capabilities
- Better for complex schema changes

### **Option 3: Blue-Green Deployment**
- Deploy new version alongside old version
- Switch traffic after successful migration
- Instant rollback capability 