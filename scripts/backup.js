const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

class DatabaseBackup {
  constructor() {
    this.backupDir = path.join(__dirname, '../backups');
    this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;
    this.dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'cafe_app',
      port: process.env.DB_PORT || 3306
    };
  }

  // Create backup directory if it doesn't exist
  async ensureBackupDir() {
    try {
      await fs.ensureDir(this.backupDir);
      console.log('Backup directory ensured');
    } catch (error) {
      console.error('Error creating backup directory:', error);
      throw error;
    }
  }

  // Generate backup filename with timestamp
  generateBackupFilename() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `cafe_app_backup_${timestamp}.sql`;
  }

  // Create database backup
  async createBackup() {
    const filename = this.generateBackupFilename();
    const filepath = path.join(this.backupDir, filename);
    
    const command = `mysqldump -h ${this.dbConfig.host} -P ${this.dbConfig.port} -u ${this.dbConfig.user} ${this.dbConfig.password ? `-p${this.dbConfig.password}` : ''} ${this.dbConfig.database} > ${filepath}`;
    
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('Backup creation failed:', error);
          reject(error);
          return;
        }
        
        if (stderr) {
          console.warn('Backup stderr:', stderr);
        }
        
        console.log(`Backup created successfully: ${filename}`);
        resolve(filepath);
      });
    });
  }

  // Compress backup file
  async compressBackup(filepath) {
    const compressedPath = `${filepath}.gz`;
    const command = `gzip ${filepath}`;
    
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('Backup compression failed:', error);
          reject(error);
          return;
        }
        
        console.log(`Backup compressed: ${compressedPath}`);
        resolve(compressedPath);
      });
    });
  }

  // Clean old backups
  async cleanOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      
      let deletedCount = 0;
      
      for (const file of files) {
        const filepath = path.join(this.backupDir, file);
        const stats = await fs.stat(filepath);
        
        if (stats.mtime < cutoffDate) {
          await fs.remove(filepath);
          console.log(`Deleted old backup: ${file}`);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        console.log(`Cleaned ${deletedCount} old backup files`);
      }
    } catch (error) {
      console.error('Error cleaning old backups:', error);
    }
  }

  // Get backup statistics
  async getBackupStats() {
    try {
      const files = await fs.readdir(this.backupDir);
      const stats = {
        totalBackups: files.length,
        totalSize: 0,
        oldestBackup: null,
        newestBackup: null
      };
      
      for (const file of files) {
        const filepath = path.join(this.backupDir, file);
        const fileStats = await fs.stat(filepath);
        
        stats.totalSize += fileStats.size;
        
        if (!stats.oldestBackup || fileStats.mtime < stats.oldestBackup) {
          stats.oldestBackup = fileStats.mtime;
        }
        
        if (!stats.newestBackup || fileStats.mtime > stats.newestBackup) {
          stats.newestBackup = fileStats.mtime;
        }
      }
      
      return stats;
    } catch (error) {
      console.error('Error getting backup stats:', error);
      return null;
    }
  }

  // Main backup process
  async performBackup() {
    try {
      console.log('Starting database backup process...');
      
      await this.ensureBackupDir();
      const backupPath = await this.createBackup();
      await this.compressBackup(backupPath);
      await this.cleanOldBackups();
      
      const stats = await this.getBackupStats();
      console.log('Backup process completed successfully', stats);
      
      return {
        success: true,
        backupPath: `${backupPath}.gz`,
        stats
      };
    } catch (error) {
      console.error('Backup process failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Schedule automated backups
  scheduleBackups() {
    const schedule = process.env.BACKUP_SCHEDULE || '0 2 * * *'; // Default: 2 AM daily
    
    console.log(`Scheduling automated backups with cron: ${schedule}`);
    
    cron.schedule(schedule, async () => {
      console.log('Running scheduled backup...');
      await this.performBackup();
    });
  }

  // Test database connection
  async testConnection() {
    const command = `mysql -h ${this.dbConfig.host} -P ${this.dbConfig.port} -u ${this.dbConfig.user} ${this.dbConfig.password ? `-p${this.dbConfig.password}` : ''} -e "SELECT 1"`;
    
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('Database connection test failed:', error);
          reject(error);
          return;
        }
        
        console.log('Database connection test successful');
        resolve(true);
      });
    });
  }
}

// CLI usage
if (require.main === module) {
  const backup = new DatabaseBackup();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'backup':
      backup.performBackup()
        .then(result => {
          console.log('Backup result:', result);
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('Backup failed:', error);
          process.exit(1);
        });
      break;
      
    case 'schedule':
      backup.scheduleBackups();
      console.log('Backup scheduling started. Press Ctrl+C to stop.');
      break;
      
    case 'test':
      backup.testConnection()
        .then(() => {
          console.log('Database connection test successful');
          process.exit(0);
        })
        .catch(error => {
          console.error('Database connection test failed:', error);
          process.exit(1);
        });
      break;
      
    case 'stats':
      backup.getBackupStats()
        .then(stats => {
          console.log('Backup statistics:', stats);
          process.exit(0);
        })
        .catch(error => {
          console.error('Failed to get backup stats:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log('Usage: node backup.js [backup|schedule|test|stats]');
      console.log('  backup  - Create a new backup');
      console.log('  schedule - Start scheduled backups');
      console.log('  test    - Test database connection');
      console.log('  stats   - Show backup statistics');
      process.exit(1);
  }
}

module.exports = DatabaseBackup; 