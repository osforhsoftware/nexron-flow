<?php

declare(strict_types=1);

final class Schema
{
    public static function migrate(PDO $pdo): void
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
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
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
  INDEX idx_doc_lines_doc (doc_id)
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
                ) {
                    throw $e;
                }
            }
        }
    }
}
