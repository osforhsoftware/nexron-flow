# Vyapar Reverse Engineering — Sale Invoice

Target feature list for **Sale → Sale Invoice** (Vyapar-style), plus current status in this app.

---

## 1. List screen (Sale Invoices)

| Feature | Description | Status |
|--------|-------------|--------|
| Invoice list | Show all sale invoices for the company | Done |
| Date filter | This month / custom date range | UI chip only |
| Party filter | Filter by customer / all parties | UI chip only |
| Search | Search by invoice no. / party | Missing |
| Columns | Date, Invoice No., Party, Tax Amt, Total Amt | Done |
| Paid / unpaid | Show payment status & balance due | Missing |
| Add Sale | Open create invoice editor | Done |
| Open / edit invoice | Re-open saved invoice | Missing |
| Delete / cancel | Remove or cancel invoice | Missing |
| Share from list | WhatsApp / PDF / image | Missing |
| Print from list | Thermal / regular print | Missing |

---

## 2. Create / edit header

| Feature | Description | Status |
|--------|-------------|--------|
| Document tabs | Multiple draft invoices at once (+ / close tab) | Done |
| Party (customer) | Required party select | Done |
| Party balance | Show BAL to receive / to pay | Done |
| Quick add party | Create customer from invoice | Missing |
| Ref No. / Invoice No. | Auto-increment + editable | Done |
| Invoice prefix | Configurable prefix (INV-, etc.) | Partial (`INV-`) |
| Invoice Date | Date picker | Done |
| Transaction time | Time on invoice + print option | Missing |
| Cash sale default | Default party as Cash | Missing |
| PO number / PO date | Customer PO details | Missing |
| Place of supply | State / emirate of supply | Missing |
| Due date & payment terms | Credit days / due date | Missing |
| Billing + shipping address | Party addresses on invoice | Missing |

---

## 3. Line items grid

| Feature | Description | Status |
|--------|-------------|--------|
| Item select | Pick from items master | Done |
| Free-text item | Type item name without master | Done |
| Qty | Quantity | Done |
| Unit | pcs / kg / ltr / box / mtr / NONE | Done |
| Price/Unit (ex-tax) | Rate without tax | Done |
| Inclusive / exclusive tax | Toggle tax-in price | Missing |
| Discount % + amount | Per-line discount | Done |
| Tax % + amount | Per-line tax (GST / VAT by country) | Done |
| Line amount | Auto calc | Done |
| Add row | Add more lines | Done |
| Totals row | Qty / discount / tax / amount totals | Done |
| Free qty | Buy X get Y free column | Missing |
| Barcode scan | Scan item into line | Missing |
| Show purchase price | Cost while selling | Missing |
| HSN / SAC | Tax classification code | Missing |
| Batch / serial / expiry | Extra item columns | Missing |
| Item count | Count of line items | Missing |

---

## 4. Tax, discount & totals

| Feature | Description | Status |
|--------|-------------|--------|
| Item-wise tax | Tax per line | Done |
| Country tax labels | India GST / UAE VAT | Done |
| Transaction-wise tax | Tax on whole bill | Missing |
| Transaction-wise discount | Bill-level discount | Missing |
| Additional charges | Shipping, packaging, etc. | Missing |
| Round off | Checkbox + round difference | Done |
| Grand total | Final total | Done |
| Show profit on invoice | Live profit while billing | Missing |
| Additional cess | Per-item cess | Missing |
| Reverse charge | Reverse charge flag | Missing |
| E-way bill no. | E-way bill field | Missing |

---

## 5. Extras (footer / side)

| Feature | Description | Status |
|--------|-------------|--------|
| Terms & Conditions | Optional T&C block | Done |
| Description / notes | Optional description | Done |
| Add image | Attach image to invoice | UI only (disabled) |
| Add document | Attach file / PDF | UI only (disabled) |
| Payment type | Cash / Bank / UPI etc. | Partial (saved, not full UI) |
| Partial payment | Receive now + balance due | Missing |
| Link payment to invoice | Paid / unpaid tracking | Missing |
| Transportation details | Vehicle / transporter | Missing |

---

## 6. Actions after create

| Feature | Description | Status |
|--------|-------------|--------|
| Save | Persist invoice + stock effect | Done |
| Share menu | WhatsApp / Email / PDF / Image | UI only |
| Print | Thermal / regular | Missing |
| Invoice preview | Preview before save | Missing |
| Share as image | Image instead of PDF | Missing |
| Convert from | Quotation → SO → Delivery → Invoice | Done (pipeline) |
| Convert to credit note | Sale return from invoice | Missing |
| Recurring invoice | Auto-repeat schedule | Missing |

---

## 7. Settings that affect Sale Invoice

| Setting | Description | Status |
|--------|-------------|--------|
| Invoice/Bill number | Auto bill numbers | Done |
| Cash sale by default | Default cash party | Missing |
| Inclusive/exclusive tax on rate | Tax mode | Missing |
| Round off transaction | Enable round off | Done (always on UI) |
| Due date & payment terms | Credit control | Missing |
| Additional charges | Extra charge lines | Missing |
| Show profit while making sale | Profit hint | Missing |
| Invoice themes / logo / signature | Print branding | Missing |
| UPI / payment QR on invoice | Collect online | Missing |
| Transaction prefixes | Per-doc prefixes | Missing |
| Passcode for edit/delete | PIN protect | Missing |

---

## 8. Related Sale menu (same family)

1. Sale Invoice ← this doc  
2. Estimate / Quotation  
3. Proforma Invoice  
4. Payment-In  
5. Sale Order  
6. Delivery Challan  
7. Sale Return / Credit Note  
8. NEXRON POS  

---

## Priority build order (parity)

1. **Payment status** — receive now, balance due, paid/unpaid on list  
2. **Edit / reopen / delete** saved invoices  
3. **Bill-level discount + additional charges**  
4. **Print / PDF / WhatsApp share**  
5. **Due date + payment terms**  
6. **HSN/SAC + place of supply** (India) / TRN fields (UAE)  
7. **Attachments** (image + document) wired for real  
8. **Inclusive tax + profit while billing**
