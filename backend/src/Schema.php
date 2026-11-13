<?php

declare(strict_types=1);

final class Schema
{
    public static function migrate(PDO $pdo): void
    {
        // Fast path: after first boot, skip DDL so Hostinger parallel API calls don't race ALTERs.
        if (self::looksMigrated($pdo)) {
            return;
        }

        $gotLock = false;
        try {
            $lockStmt = $pdo->query("SELECT GET_LOCK('nexron_schema_migrate', 15)");
            $gotLock = $lockStmt !== false && (int) $lockStmt->fetchColumn() === 1;
        } catch (PDOException $e) {
            $gotLock = false;
        }

        try {
            if (self::looksMigrated($pdo)) {
                return;
            }
            self::migrateLocked($pdo);
        } finally {
            if ($gotLock) {
                try {
                    $pdo->query("SELECT RELEASE_LOCK('nexron_schema_migrate')");
                } catch (PDOException $e) {
                    // ignore
                }
            }
        }
    }

    /** Cheap probe for latest columns added by migrateLocked(). */
    private static function looksMigrated(PDO $pdo): bool
    {
        try {
            $pdo->query('SELECT user_type FROM users LIMIT 0');
            $pdo->query('SELECT is_staff FROM users LIMIT 0');
            $pdo->query('SELECT settings_json FROM companies LIMIT 0');
            $pdo->query('SELECT stock_effect FROM transactions LIMIT 0');
            $pdo->query('SELECT stock_posted_at FROM docs LIMIT 0');
            $pdo->query('SELECT id FROM equipment LIMIT 0');
            $pdo->query('SELECT id FROM service_calls LIMIT 0');
            $pdo->query('SELECT qa_decision FROM service_calls LIMIT 0');
            $pdo->query('SELECT inspector_signature FROM service_calls LIMIT 0');
            $pdo->query('SELECT work_details FROM service_calls LIMIT 0');
            $pdo->query('SELECT requested_parts FROM service_calls LIMIT 0');
            $pdo->query('SELECT id FROM service_visits LIMIT 0');
            $pdo->query('SELECT id FROM notifications LIMIT 0');
            $pdo->query('SELECT id FROM modules LIMIT 0');
            return true;
        } catch (PDOException $e) {
            return false;
        }
    }

    private static function migrateLocked(PDO $pdo): void
    {
        $statements = [
            <<<SQL
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(150) NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'office',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  email VARCHAR(150) NULL,
  gstin VARCHAR(30) NULL,
  address TEXT NULL,
  state VARCHAR(80) NULL,
  country VARCHAR(10) NOT NULL DEFAULT 'AE',
  currency VARCHAR(10) NOT NULL DEFAULT 'AED',
  tax_type VARCHAR(10) NOT NULL DEFAULT 'VAT',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS parties (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(150) NULL,
  gstin VARCHAR(30) NULL,
  type VARCHAR(20) NOT NULL,
  opening_balance DOUBLE NOT NULL DEFAULT 0,
  balance_type VARCHAR(20) NOT NULL DEFAULT 'to_receive',
  address TEXT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_parties_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_parties_company (company_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(80) NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
  sale_price DOUBLE NOT NULL DEFAULT 0,
  purchase_price DOUBLE NOT NULL DEFAULT 0,
  stock_qty DOUBLE NOT NULL DEFAULT 0,
  tax_percent DOUBLE NOT NULL DEFAULT 18,
  category VARCHAR(100) NULL,
  item_type VARCHAR(20) NOT NULL DEFAULT 'product',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_items_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_items_company (company_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS payment_types (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  kind VARCHAR(30) NOT NULL,
  opening_balance DOUBLE NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_pay_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_pay_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  type VARCHAR(30) NOT NULL,
  number VARCHAR(60) NOT NULL,
  date VARCHAR(20) NOT NULL,
  party_id VARCHAR(64) NULL,
  payment_type_id VARCHAR(64) NULL,
  notes TEXT NULL,
  subtotal DOUBLE NOT NULL DEFAULT 0,
  tax_total DOUBLE NOT NULL DEFAULT 0,
  grand_total DOUBLE NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_tx_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL,
  CONSTRAINT fk_tx_pay FOREIGN KEY (payment_type_id) REFERENCES payment_types(id) ON DELETE SET NULL,
  INDEX idx_tx_company (company_id, type, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS line_items (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  transaction_id VARCHAR(64) NOT NULL,
  item_id VARCHAR(64) NULL,
  name VARCHAR(200) NOT NULL,
  qty DOUBLE NOT NULL,
  rate DOUBLE NOT NULL,
  tax_percent DOUBLE NOT NULL DEFAULT 0,
  amount DOUBLE NOT NULL,
  CONSTRAINT fk_line_tx FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_line_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  INDEX idx_lines_tx (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS master_data (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  kind VARCHAR(60) NOT NULL,
  code VARCHAR(60) NOT NULL,
  label VARCHAR(200) NOT NULL,
  value VARCHAR(200) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uq_master (company_id, kind, code),
  CONSTRAINT fk_master_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS docs (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  doc_type VARCHAR(40) NOT NULL,
  number VARCHAR(60) NOT NULL,
  date VARCHAR(20) NOT NULL,
  party_id VARCHAR(64) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  notes TEXT NULL,
  subtotal DOUBLE NOT NULL DEFAULT 0,
  tax_total DOUBLE NOT NULL DEFAULT 0,
  grand_total DOUBLE NOT NULL DEFAULT 0,
  converted_to_id VARCHAR(64) NULL,
  converted_to_type VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX idx_docs_company_type (company_id, doc_type, date),
  INDEX idx_docs_party (party_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS doc_lines (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  doc_id VARCHAR(64) NOT NULL,
  item_id VARCHAR(64) NULL,
  name VARCHAR(200) NOT NULL,
  qty DOUBLE NOT NULL,
  rate DOUBLE NOT NULL,
  tax_percent DOUBLE NOT NULL DEFAULT 0,
  amount DOUBLE NOT NULL,
  discount_percent DOUBLE NOT NULL DEFAULT 0,
  unit VARCHAR(30) NULL,
  INDEX idx_doc_lines_doc (doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS item_categories (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_item_categories_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_item_categories_company_name (company_id, name),
  INDEX idx_item_categories_company (company_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS party_types (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_builtin TINYINT(1) NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_party_types_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_party_types_company_slug (company_id, slug),
  INDEX idx_party_types_company (company_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS doc_revisions (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  doc_id VARCHAR(64) NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  snapshot LONGTEXT NOT NULL,
  changed_by VARCHAR(64) NULL,
  change_note VARCHAR(255) NULL,
  created_at VARCHAR(40) NOT NULL,
  INDEX idx_doc_revisions_doc (doc_id, revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS equipment (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  asset_tag VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  model VARCHAR(120) NULL,
  manufacturer VARCHAR(120) NULL,
  category VARCHAR(80) NULL,
  serial_number VARCHAR(120) NOT NULL,
  customer_id VARCHAR(64) NULL,
  location VARCHAR(200) NULL,
  install_date VARCHAR(20) NULL,
  warranty_start VARCHAR(20) NULL,
  warranty_end VARCHAR(20) NULL,
  no_machine_warranty TINYINT(1) NOT NULL DEFAULT 0,
  service_warranty_start VARCHAR(20) NULL,
  service_warranty_end VARCHAR(20) NULL,
  no_service_warranty TINYINT(1) NOT NULL DEFAULT 0,
  `condition` VARCHAR(80) NULL,
  current_status VARCHAR(40) NOT NULL DEFAULT 'in_service',
  additional_note TEXT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_equipment_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_equipment_customer FOREIGN KEY (customer_id) REFERENCES parties(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_equipment_serial (company_id, serial_number),
  UNIQUE KEY uniq_equipment_asset (company_id, asset_tag),
  INDEX idx_equipment_company (company_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS equipment_history (
  id VARCHAR(64) PRIMARY KEY,
  equipment_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  summary VARCHAR(255) NOT NULL,
  from_value TEXT NULL,
  to_value TEXT NULL,
  created_at VARCHAR(40) NOT NULL,
  INDEX idx_equipment_history_equip (equipment_id, created_at),
  CONSTRAINT fk_equipment_history_equip FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS service_calls (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  call_no VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(200) NOT NULL,
  equipment_id VARCHAR(64) NULL,
  equipment_name VARCHAR(200) NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'Repair',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(40) NOT NULL DEFAULT 'open',
  description TEXT NOT NULL,
  assigned_user_id VARCHAR(64) NULL,
  assigned_name VARCHAR(200) NULL,
  scheduled_for VARCHAR(40) NULL,
  notes TEXT NULL,
  invoice_doc_id VARCHAR(64) NULL,
  completed_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_service_calls_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_service_calls_customer FOREIGN KEY (customer_id) REFERENCES parties(id) ON DELETE RESTRICT,
  CONSTRAINT fk_service_calls_equipment FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_service_calls_no (company_id, call_no),
  INDEX idx_service_calls_company (company_id, status, created_at),
  INDEX idx_service_calls_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS service_visits (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  service_call_id VARCHAR(64) NOT NULL,
  visit_no VARCHAR(64) NOT NULL,
  visit_date VARCHAR(20) NOT NULL,
  assigned_user_id VARCHAR(64) NULL,
  assigned_name VARCHAR(200) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'planned',
  work_done TEXT NULL,
  notes TEXT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  CONSTRAINT fk_service_visits_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_service_visits_call FOREIGN KEY (service_call_id) REFERENCES service_calls(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_service_visits_no (service_call_id, visit_no),
  INDEX idx_service_visits_call (service_call_id, visit_date),
  INDEX idx_service_visits_company (company_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS modules (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uniq_modules_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS sub_modules (
  id VARCHAR(64) PRIMARY KEY,
  module_id VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  directory VARCHAR(120) NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uniq_sub_modules_directory (directory),
  INDEX idx_sub_modules_module (module_id),
  CONSTRAINT fk_sub_modules_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uniq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS role_permissions (
  id VARCHAR(64) PRIMARY KEY,
  role_id VARCHAR(64) NOT NULL,
  sub_module_id VARCHAR(64) NOT NULL,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_read TINYINT(1) NOT NULL DEFAULT 0,
  can_update TINYINT(1) NOT NULL DEFAULT 0,
  can_delete TINYINT(1) NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uniq_role_sub_module (role_id, sub_module_id),
  INDEX idx_role_permissions_role (role_id),
  INDEX idx_role_permissions_sub (sub_module_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_sub FOREIGN KEY (sub_module_id) REFERENCES sub_modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
            <<<SQL
CREATE TABLE IF NOT EXISTS user_roles (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  role_id VARCHAR(64) NOT NULL,
  assigned_by VARCHAR(64) NULL,
  assigned_at VARCHAR(40) NOT NULL,
  UNIQUE KEY uniq_user_role (user_id, role_id),
  INDEX idx_user_roles_user (user_id),
  INDEX idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL,
        ];

        foreach ($statements as $sql) {
            try {
                $pdo->exec($sql);
            } catch (PDOException $e) {
                // Ignore "table already exists" / duplicate index on re-run.
                $msg = $e->getMessage();
                if (
                    stripos($msg, 'already exists') === false
                    && stripos($msg, 'Duplicate') === false
                    && stripos($msg, 'Lock wait timeout') === false
                    && stripos($msg, 'Deadlock') === false
                ) {
                    throw $e;
                }
            }
        }

        self::addColumnIfMissing($pdo, 'parties', 'type_other', 'VARCHAR(80) NULL');
        self::addColumnIfMissing($pdo, 'parties', 'contact_person', 'VARCHAR(150) NULL');
        self::addColumnIfMissing($pdo, 'parties', 'city', 'VARCHAR(120) NULL');
        self::addColumnIfMissing($pdo, 'parties', 'country', 'VARCHAR(80) NULL');
        self::addColumnIfMissing($pdo, 'parties', 'license_gst', 'VARCHAR(80) NULL');
        self::addColumnIfMissing($pdo, 'parties', 'price_category', 'VARCHAR(80) NULL');
        self::addColumnIfMissing($pdo, 'parties', 'delivery_address', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'parties', 'additional_fields', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'parties', 'notes', 'TEXT NULL');
        try {
            $pdo->exec('ALTER TABLE parties MODIFY type VARCHAR(80) NOT NULL');
        } catch (PDOException $e) {
            // ignore
        }

        self::addColumnIfMissing($pdo, 'companies', 'country', "VARCHAR(10) NOT NULL DEFAULT 'AE' AFTER state");
        if (self::addColumnIfMissing($pdo, 'companies', 'tax_type', "VARCHAR(10) NOT NULL DEFAULT 'VAT' AFTER currency")) {
            try {
                // New column defaults to VAT; align existing Indian companies to GST once.
                $pdo->exec("UPDATE companies SET tax_type = 'GST' WHERE UPPER(TRIM(IFNULL(country, ''))) = 'IN'");
            } catch (PDOException $e) {
                // ignore
            }
        }
        self::addColumnIfMissing($pdo, 'companies', 'logo_url', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'companies', 'signature_url', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'companies', 'default_terms', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'companies', 'asset_tag_start', "VARCHAR(64) NULL");
        self::addColumnIfMissing($pdo, 'companies', 'settings_json', 'LONGTEXT NULL');

        self::addColumnIfMissing($pdo, 'items', 'item_type', "VARCHAR(20) NOT NULL DEFAULT 'product'");
        self::addColumnIfMissing($pdo, 'items', 'image_url', 'MEDIUMTEXT NULL');

        self::addColumnIfMissing($pdo, 'docs', 'valid_until', 'VARCHAR(20) NULL');
        self::addColumnIfMissing($pdo, 'docs', 'follow_up_date', 'VARCHAR(20) NULL');
        self::addColumnIfMissing($pdo, 'docs', 'terms', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'docs', 'billing_address', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'docs', 'state_of_supply', 'VARCHAR(80) NULL');
        self::addColumnIfMissing($pdo, 'docs', 'price_tax_mode', "VARCHAR(20) NOT NULL DEFAULT 'without'");
        self::addColumnIfMissing($pdo, 'docs', 'round_off', 'TINYINT(1) NOT NULL DEFAULT 1');
        self::addColumnIfMissing($pdo, 'docs', 'discount_total', 'DOUBLE NOT NULL DEFAULT 0');
        self::addColumnIfMissing($pdo, 'docs', 'revision', 'INT NOT NULL DEFAULT 1');
        self::addColumnIfMissing($pdo, 'docs', 'cloned_from_id', 'VARCHAR(64) NULL');
        self::addColumnIfMissing($pdo, 'docs', 'ref_no', 'VARCHAR(60) NULL');
        self::addColumnIfMissing($pdo, 'docs', 'original_bill_no', 'VARCHAR(80) NULL');
        self::addColumnIfMissing($pdo, 'docs', 'stock_posted_at', 'VARCHAR(40) NULL');

        self::addColumnIfMissing($pdo, 'doc_lines', 'discount_percent', 'DOUBLE NOT NULL DEFAULT 0');
        self::addColumnIfMissing($pdo, 'doc_lines', 'unit', 'VARCHAR(30) NULL');
        self::addColumnIfMissing($pdo, 'doc_lines', 'received_qty', 'DOUBLE NULL');
        self::addColumnIfMissing($pdo, 'transactions', 'stock_effect', 'TINYINT(1) NOT NULL DEFAULT 1');

        // Legacy pipeline used status=open; map to draft for quotations lifecycle.
        try {
            $pdo->exec("UPDATE docs SET status = 'draft' WHERE status = 'open'");
        } catch (PDOException $e) {
            // ignore
        }

        // RBAC: super-admin flag (1 = bypass all permission checks).
        self::addColumnIfMissing($pdo, 'users', 'user_type', 'TINYINT NOT NULL DEFAULT 0');
        self::addColumnIfMissing($pdo, 'users', 'is_staff', 'TINYINT(1) NOT NULL DEFAULT 0');

        // Service call lifecycle (MMS-style stages) — additive, backward compatible.
        self::addColumnIfMissing($pdo, 'service_calls', 'equipment_ids_json', 'LONGTEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'inspector_id', 'VARCHAR(64) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'inspector_name', 'VARCHAR(200) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'inspection_date', 'VARCHAR(40) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'findings', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'severity', 'VARCHAR(20) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'recommendation', 'VARCHAR(80) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'recommendation_notes', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'inspection_photos_json', 'LONGTEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'work_required', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'work_details', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'requested_parts', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'inspector_signature', 'LONGTEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'engineer_user_id', 'VARCHAR(64) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'engineer_name', 'VARCHAR(200) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'estimate_lines_json', 'LONGTEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'estimate_discount', 'DOUBLE NOT NULL DEFAULT 0');
        self::addColumnIfMissing($pdo, 'service_calls', 'estimate_notes', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'estimate_finalized_at', 'VARCHAR(40) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'parts_used_json', 'LONGTEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'service_photos_json', 'LONGTEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'customer_handoff', 'TINYINT(1) NOT NULL DEFAULT 0');
        self::addColumnIfMissing($pdo, 'service_calls', 'customer_receiver_name', 'VARCHAR(200) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'customer_signature', 'LONGTEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'qa_decision', 'VARCHAR(20) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'qa_remarks', 'TEXT NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'qa_verified_by', 'VARCHAR(64) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'qa_verified_by_name', 'VARCHAR(200) NULL');
        self::addColumnIfMissing($pdo, 'service_calls', 'qa_verified_at', 'VARCHAR(40) NULL');

        try {
            $pdo->exec("UPDATE service_calls SET status = 'inspection' WHERE status = 'assigned'");
            $pdo->exec("UPDATE service_calls SET status = 'billing' WHERE status = 'done'");
        } catch (PDOException $e) {
            // ignore
        }

        try {
            $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  link VARCHAR(255) NULL,
  kind VARCHAR(40) NULL,
  ref_id VARCHAR(64) NULL,
  read_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  INDEX idx_notifications_user (user_id, created_at),
  INDEX idx_notifications_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);
        } catch (PDOException $e) {
            // ignore
        }

        if (class_exists('Rbac')) {
            Rbac::ensureCatalog($pdo);
        }
    }

    /** @return bool true when the column was newly added */
    private static function addColumnIfMissing(PDO $pdo, string $table, string $column, string $definition): bool
    {
        try {
            $pdo->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
            return true;
        } catch (PDOException $e) {
            $msg = $e->getMessage();
            if (
                stripos($msg, 'Duplicate') !== false
                || stripos($msg, 'exists') !== false
                || stripos($msg, 'Lock wait timeout') !== false
                || stripos($msg, 'Deadlock') !== false
                || stripos($msg, 'try restarting transaction') !== false
            ) {
                return false;
            }
            throw $e;
        }
    }
}
