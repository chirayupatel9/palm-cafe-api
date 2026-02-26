-- =============================================================================
-- Palm Cafe - Full Database Schema (Consolidated)
-- =============================================================================
-- Single-file schema to create a fresh database. Run this once to initialize.
-- Requires: MySQL 5.7+ / MariaDB 10.2+ with InnoDB, utf8mb4.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `cafe_app` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `cafe_app`;

-- -----------------------------------------------------------------------------
-- Cafes (multi-tenant root)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cafes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `name` VARCHAR(200) DEFAULT NULL,
  `description` TEXT,
  `logo_url` VARCHAR(500),
  `address` TEXT,
  `phone` VARCHAR(50),
  `email` VARCHAR(200),
  `website` VARCHAR(200),
  `is_active` BOOLEAN DEFAULT TRUE,
  `subscription_plan` ENUM('FREE', 'PRO') DEFAULT 'FREE' NOT NULL,
  `subscription_status` ENUM('active', 'inactive', 'expired') DEFAULT 'active' NOT NULL,
  `enabled_modules` JSON NULL,
  `is_onboarded` BOOLEAN DEFAULT FALSE NOT NULL,
  `onboarding_data` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_slug` (`slug`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_subscription_plan` (`subscription_plan`),
  INDEX `idx_is_onboarded` (`is_onboarded`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Users (cafe_id nullable for superadmin)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `email` VARCHAR(200) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'user', 'chef', 'reception', 'superadmin') DEFAULT 'user',
  `cafe_id` INT NULL,
  `last_login` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_cafe_id` (`cafe_id`),
  CONSTRAINT `fk_users_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Categories (per-cafe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `sort_order` INT DEFAULT 0,
  `is_active` BOOLEAN DEFAULT TRUE,
  `cafe_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_categories_cafe_id` (`cafe_id`),
  CONSTRAINT `fk_categories_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Menu items (per-cafe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `menu_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `price` DECIMAL(10,2) NOT NULL,
  `category_id` INT NULL,
  `is_available` BOOLEAN DEFAULT TRUE,
  `sort_order` INT DEFAULT 0,
  `image_url` VARCHAR(255) NULL,
  `featured_priority` INT NULL,
  `cafe_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_menu_items_cafe_id` (`cafe_id`),
  INDEX `idx_category_id` (`category_id`),
  CONSTRAINT `fk_menu_items_category` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_menu_items_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Customers (per-cafe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL,
  `email` VARCHAR(200),
  `phone` VARCHAR(50),
  `address` TEXT,
  `date_of_birth` DATE,
  `loyalty_points` INT DEFAULT 0,
  `total_spent` DECIMAL(10,2) DEFAULT 0,
  `visit_count` INT DEFAULT 0,
  `first_visit_date` TIMESTAMP NULL,
  `last_visit_date` TIMESTAMP NULL,
  `is_active` BOOLEAN DEFAULT TRUE,
  `notes` TEXT,
  `cafe_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_phone` (`phone`),
  INDEX `idx_customers_cafe_id` (`cafe_id`),
  CONSTRAINT `fk_customers_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Orders (per-cafe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_number` VARCHAR(50) UNIQUE NOT NULL,
  `customer_id` INT NULL,
  `customer_name` VARCHAR(200),
  `customer_email` VARCHAR(200),
  `customer_phone` VARCHAR(50),
  `table_number` VARCHAR(20) NULL,
  `total_amount` DECIMAL(10,2) NOT NULL,
  `tax_amount` DECIMAL(10,2) DEFAULT 0,
  `tip_amount` DECIMAL(10,2) DEFAULT 0,
  `points_redeemed` INT DEFAULT 0,
  `points_awarded` BOOLEAN DEFAULT FALSE,
  `final_amount` DECIMAL(10,2) NOT NULL,
  `status` ENUM('pending', 'preparing', 'ready', 'completed', 'cancelled') DEFAULT 'pending',
  `payment_method` ENUM('cash', 'card', 'upi', 'online') DEFAULT 'cash',
  `split_payment` BOOLEAN DEFAULT FALSE,
  `split_payment_method` VARCHAR(50) NULL,
  `split_amount` DECIMAL(10,2) DEFAULT 0.00,
  `extra_charge` DECIMAL(10,2) DEFAULT 0.00,
  `extra_charge_note` VARCHAR(255) NULL,
  `notes` TEXT,
  `cafe_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_orders_cafe_id` (`cafe_id`),
  INDEX `idx_table_number` (`table_number`),
  CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_orders_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Order items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `menu_item_id` INT NULL,
  `item_name` VARCHAR(200) NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price` DECIMAL(10,2) NOT NULL,
  `total_price` DECIMAL(10,2) NOT NULL,
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_menu_item` FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Invoices (per-cafe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_number` VARCHAR(50) UNIQUE NOT NULL,
  `order_id` INT NULL,
  `customer_name` VARCHAR(200),
  `customer_email` VARCHAR(200),
  `customer_phone` VARCHAR(50),
  `subtotal` DECIMAL(10,2) NOT NULL,
  `tax_amount` DECIMAL(10,2) DEFAULT 0,
  `tip_amount` DECIMAL(10,2) DEFAULT 0,
  `total_amount` DECIMAL(10,2) NOT NULL,
  `tax_rate` DECIMAL(5,2) DEFAULT 0,
  `tax_name` VARCHAR(100) DEFAULT 'Tax',
  `payment_method` ENUM('cash', 'card', 'upi', 'online') DEFAULT 'cash',
  `invoice_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `cafe_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_invoices_cafe_id` (`cafe_id`),
  CONSTRAINT `fk_invoices_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_invoices_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Invoice items
-- NOTE: menu_item_id is VARCHAR(36) for legacy compatibility (no FK to menu_items).
-- order_items.menu_item_id is INT and references menu_items(id). To align types
-- and add FK on invoice_items, run a migration that alters menu_item_id to INT
-- after ensuring existing values are numeric or migrated.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_number` VARCHAR(50) NOT NULL,
  `menu_item_id` VARCHAR(36) NOT NULL,
  `item_name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `quantity` INT NOT NULL,
  `total` DECIMAL(10,2) NOT NULL,
  CONSTRAINT `fk_invoice_items_invoice` FOREIGN KEY (`invoice_number`) REFERENCES `invoices`(`invoice_number`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tax settings (per-cafe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tax_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tax_name` VARCHAR(100) NOT NULL DEFAULT 'Sales Tax',
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `is_active` BOOLEAN DEFAULT TRUE,
  `show_tax_in_menu` BOOLEAN DEFAULT TRUE,
  `include_tax` BOOLEAN DEFAULT TRUE,
  `cafe_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_tax_settings_cafe_id` (`cafe_id`),
  CONSTRAINT `fk_tax_settings_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tax_settings_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tax_name` VARCHAR(100) NOT NULL,
  `tax_rate` DECIMAL(5,2) NOT NULL,
  `changed_by` VARCHAR(100) DEFAULT 'system',
  `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Currency settings (per-cafe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `currency_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `currency_code` VARCHAR(3) NOT NULL DEFAULT 'INR',
  `currency_symbol` VARCHAR(10) NOT NULL DEFAULT '₹',
  `currency_name` VARCHAR(100) NOT NULL DEFAULT 'Indian Rupee',
  `is_active` BOOLEAN DEFAULT TRUE,
  `cafe_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_currency_settings_cafe_id` (`cafe_id`),
  CONSTRAINT `fk_currency_settings_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `currency_settings_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `currency_code` VARCHAR(3) NOT NULL,
  `currency_symbol` VARCHAR(10) NOT NULL,
  `currency_name` VARCHAR(100) NOT NULL,
  `changed_by` VARCHAR(100) DEFAULT 'system',
  `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Cafe settings (per-cafe, all migration columns)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cafe_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cafe_id` INT NULL,
  `cafe_name` VARCHAR(200) DEFAULT NULL,
  `logo_url` VARCHAR(500) DEFAULT NULL,
  `hero_image_url` VARCHAR(500) NULL,
  `promo_banner_image_url` VARCHAR(500) NULL,
  `address` TEXT,
  `phone` VARCHAR(50),
  `email` VARCHAR(200),
  `website` VARCHAR(200),
  `opening_hours` TEXT,
  `description` TEXT,
  `show_kitchen_tab` BOOLEAN DEFAULT TRUE,
  `show_customers_tab` BOOLEAN DEFAULT TRUE,
  `show_payment_methods_tab` BOOLEAN DEFAULT TRUE,
  `show_menu_tab` BOOLEAN DEFAULT TRUE,
  `show_inventory_tab` BOOLEAN DEFAULT TRUE,
  `show_history_tab` BOOLEAN DEFAULT TRUE,
  `show_menu_images` BOOLEAN DEFAULT TRUE,
  `primary_color` VARCHAR(7) DEFAULT '#1F2937',
  `secondary_color` VARCHAR(7) DEFAULT '#F59E0B',
  `light_surface_color` VARCHAR(7) DEFAULT '#FFFFFF',
  `dark_surface_color` VARCHAR(7) DEFAULT '#1F2937',
  `chef_show_kitchen_tab` BOOLEAN DEFAULT TRUE,
  `chef_show_menu_tab` BOOLEAN DEFAULT FALSE,
  `chef_show_inventory_tab` BOOLEAN DEFAULT FALSE,
  `chef_show_history_tab` BOOLEAN DEFAULT FALSE,
  `chef_can_edit_orders` BOOLEAN DEFAULT TRUE,
  `chef_can_view_customers` BOOLEAN DEFAULT FALSE,
  `chef_can_view_payments` BOOLEAN DEFAULT FALSE,
  `reception_show_kitchen_tab` BOOLEAN DEFAULT TRUE,
  `reception_show_menu_tab` BOOLEAN DEFAULT FALSE,
  `reception_show_inventory_tab` BOOLEAN DEFAULT FALSE,
  `reception_show_history_tab` BOOLEAN DEFAULT FALSE,
  `reception_can_edit_orders` BOOLEAN DEFAULT TRUE,
  `reception_can_view_customers` BOOLEAN DEFAULT TRUE,
  `reception_can_view_payments` BOOLEAN DEFAULT TRUE,
  `reception_can_create_orders` BOOLEAN DEFAULT TRUE,
  `admin_can_access_settings` BOOLEAN DEFAULT FALSE,
  `admin_can_manage_users` BOOLEAN DEFAULT FALSE,
  `admin_can_view_reports` BOOLEAN DEFAULT TRUE,
  `admin_can_manage_inventory` BOOLEAN DEFAULT TRUE,
  `admin_can_manage_menu` BOOLEAN DEFAULT TRUE,
  `enable_thermal_printer` BOOLEAN DEFAULT FALSE,
  `default_printer_type` ENUM('system', 'usb', 'serial') DEFAULT 'system',
  `printer_name` VARCHAR(255) NULL,
  `printer_port` VARCHAR(100) NULL,
  `printer_baud_rate` INT DEFAULT 9600,
  `auto_print_new_orders` BOOLEAN DEFAULT FALSE,
  `print_order_copies` INT DEFAULT 1,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_cafe_settings_cafe_id` (`cafe_id`),
  CONSTRAINT `fk_cafe_settings_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cafe_settings_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cafe_name` VARCHAR(200),
  `logo_url` VARCHAR(500),
  `hero_image_url` VARCHAR(500) NULL,
  `promo_banner_image_url` VARCHAR(500) NULL,
  `address` TEXT,
  `phone` VARCHAR(50),
  `email` VARCHAR(200),
  `website` VARCHAR(200),
  `opening_hours` TEXT,
  `description` TEXT,
  `show_kitchen_tab` BOOLEAN DEFAULT TRUE,
  `show_customers_tab` BOOLEAN DEFAULT TRUE,
  `show_payment_methods_tab` BOOLEAN DEFAULT TRUE,
  `show_menu_tab` BOOLEAN DEFAULT TRUE,
  `show_inventory_tab` BOOLEAN DEFAULT TRUE,
  `show_history_tab` BOOLEAN DEFAULT TRUE,
  `show_menu_images` BOOLEAN DEFAULT TRUE,
  `primary_color` VARCHAR(7) DEFAULT '#1F2937',
  `secondary_color` VARCHAR(7) DEFAULT '#F59E0B',
  `light_surface_color` VARCHAR(7) DEFAULT '#FFFFFF',
  `dark_surface_color` VARCHAR(7) DEFAULT '#1F2937',
  `chef_show_kitchen_tab` BOOLEAN DEFAULT TRUE,
  `chef_show_menu_tab` BOOLEAN DEFAULT FALSE,
  `chef_show_inventory_tab` BOOLEAN DEFAULT FALSE,
  `chef_show_history_tab` BOOLEAN DEFAULT FALSE,
  `chef_can_edit_orders` BOOLEAN DEFAULT TRUE,
  `chef_can_view_customers` BOOLEAN DEFAULT FALSE,
  `chef_can_view_payments` BOOLEAN DEFAULT FALSE,
  `reception_show_kitchen_tab` BOOLEAN DEFAULT TRUE,
  `reception_show_menu_tab` BOOLEAN DEFAULT FALSE,
  `reception_show_inventory_tab` BOOLEAN DEFAULT FALSE,
  `reception_show_history_tab` BOOLEAN DEFAULT FALSE,
  `reception_can_edit_orders` BOOLEAN DEFAULT TRUE,
  `reception_can_view_customers` BOOLEAN DEFAULT TRUE,
  `reception_can_view_payments` BOOLEAN DEFAULT TRUE,
  `reception_can_create_orders` BOOLEAN DEFAULT TRUE,
  `admin_can_access_settings` BOOLEAN DEFAULT FALSE,
  `admin_can_manage_users` BOOLEAN DEFAULT FALSE,
  `admin_can_view_reports` BOOLEAN DEFAULT TRUE,
  `admin_can_manage_inventory` BOOLEAN DEFAULT TRUE,
  `admin_can_manage_menu` BOOLEAN DEFAULT TRUE,
  `enable_thermal_printer` BOOLEAN DEFAULT FALSE,
  `default_printer_type` ENUM('system', 'usb', 'serial') DEFAULT 'system',
  `printer_name` VARCHAR(255) NULL,
  `printer_port` VARCHAR(100) NULL,
  `printer_baud_rate` INT DEFAULT 9600,
  `auto_print_new_orders` BOOLEAN DEFAULT FALSE,
  `print_order_copies` INT DEFAULT 1,
  `changed_by` VARCHAR(100) DEFAULT 'admin',
  `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Inventory (per-cafe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `quantity` DECIMAL(10,3) NOT NULL DEFAULT 0,
  `unit` VARCHAR(50) NOT NULL,
  `cost_per_unit` DECIMAL(10,2) DEFAULT NULL,
  `supplier` VARCHAR(200) DEFAULT NULL,
  `reorder_level` DECIMAL(10,3) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `cafe_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_inventory_cafe_id` (`cafe_id`),
  CONSTRAINT `fk_inventory_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Payment methods (per-cafe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payment_methods` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `description` TEXT,
  `icon` VARCHAR(10),
  `display_order` INT DEFAULT 0,
  `is_active` BOOLEAN DEFAULT TRUE,
  `cafe_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_payment_methods_cafe_id` (`cafe_id`),
  CONSTRAINT `fk_payment_methods_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Feature flags
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `features` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(100) NOT NULL UNIQUE,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT,
  `default_free` BOOLEAN DEFAULT FALSE,
  `default_pro` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cafe_feature_overrides` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cafe_id` INT NOT NULL,
  `feature_key` VARCHAR(100) NOT NULL,
  `enabled` BOOLEAN NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_cafe_feature` (`cafe_id`, `feature_key`),
  INDEX `idx_cafe_id` (`cafe_id`),
  INDEX `idx_feature_key` (`feature_key`),
  CONSTRAINT `fk_cafe_feature_overrides_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cafe_feature_overrides_feature` FOREIGN KEY (`feature_key`) REFERENCES `features`(`key`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Subscription audit log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_audit_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cafe_id` INT NOT NULL,
  `action_type` ENUM('PLAN_CHANGED', 'FEATURE_ENABLED', 'FEATURE_DISABLED', 'CAFE_ACTIVATED', 'CAFE_DEACTIVATED') NOT NULL,
  `previous_value` VARCHAR(255),
  `new_value` VARCHAR(255),
  `changed_by` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cafe_id` (`cafe_id`),
  INDEX `idx_action_type` (`action_type`),
  INDEX `idx_created_at` (`created_at`),
  CONSTRAINT `fk_subscription_audit_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subscription_audit_user` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Cafe daily metrics
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cafe_daily_metrics` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cafe_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `total_orders` INT DEFAULT 0,
  `total_revenue` DECIMAL(10,2) DEFAULT 0.00,
  `completed_orders` INT DEFAULT 0,
  `completed_revenue` DECIMAL(10,2) DEFAULT 0.00,
  `total_customers` INT DEFAULT 0,
  `new_customers` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_cafe_date` (`cafe_id`, `date`),
  INDEX `idx_cafe_id` (`cafe_id`),
  INDEX `idx_date` (`date`),
  CONSTRAINT `fk_cafe_daily_metrics_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Promo banners
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `promo_banners` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cafe_id` INT NOT NULL,
  `image_url` VARCHAR(500) NOT NULL,
  `link_url` VARCHAR(500) NULL,
  `priority` INT NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_promo_banners_cafe_id` (`cafe_id`),
  INDEX `idx_promo_banners_active_priority` (`cafe_id`, `active`, `priority`),
  CONSTRAINT `fk_promo_banners_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Impersonation audit log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `impersonation_audit_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `super_admin_id` INT NOT NULL,
  `super_admin_email` VARCHAR(200),
  `cafe_id` INT NOT NULL,
  `cafe_slug` VARCHAR(100),
  `cafe_name` VARCHAR(200),
  `action_type` ENUM('IMPERSONATION_STARTED', 'IMPERSONATION_ENDED') NOT NULL,
  `ip_address` VARCHAR(45),
  `user_agent` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_super_admin_id` (`super_admin_id`),
  INDEX `idx_cafe_id` (`cafe_id`),
  INDEX `idx_action_type` (`action_type`),
  INDEX `idx_created_at` (`created_at`),
  CONSTRAINT `fk_impersonation_super_admin` FOREIGN KEY (`super_admin_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_impersonation_cafe` FOREIGN KEY (`cafe_id`) REFERENCES `cafes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Migrations tracking (optional for fresh install)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `migration_name` VARCHAR(255) NOT NULL UNIQUE,
  `executed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
