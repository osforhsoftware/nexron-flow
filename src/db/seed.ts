import { db, setMeta, uid } from "./database";

export async function ensureSeeded(): Promise<void> {
  const seeded = await db.meta.get("seeded");
  if (seeded?.value === "1") return;

  const companyAId = uid("co");
  const companyBId = uid("co");
  const now = new Date().toISOString();

  await db.companies.bulkAdd([
    {
      id: companyAId,
      name: "Nexron UAE Services",
      phone: "971500000001",
      email: "accounts@nexron-uae.demo",
      gstin: "100123456700003",
      address: "Business Bay, Dubai",
      state: "Dubai",
      country: "AE",
      currency: "AED",
      createdAt: now,
    },
    {
      id: companyBId,
      name: "Coastal Supplies Co.",
      phone: "9876543210",
      email: "hello@coastal.demo",
      gstin: "32AABCC9876F1Z2",
      address: "8 Harbour Lane, Kochi",
      state: "Kerala",
      country: "IN",
      currency: "INR",
      createdAt: now,
    },
  ]);

  const parties = [
    {
      id: uid("pty"),
      companyId: companyAId,
      name: "Aarav Electronics",
      phone: "9001002001",
      type: "customer" as const,
      openingBalance: 12000,
      balanceType: "to_receive" as const,
      address: "MG Road",
      createdAt: now,
    },
    {
      id: uid("pty"),
      companyId: companyAId,
      name: "Nova Wholesale",
      phone: "9001002002",
      type: "supplier" as const,
      openingBalance: 8500,
      balanceType: "to_pay" as const,
      address: "Peenya",
      createdAt: now,
    },
    {
      id: uid("pty"),
      companyId: companyAId,
      name: "City Mart Retail",
      phone: "9001002003",
      type: "both" as const,
      openingBalance: 0,
      balanceType: "to_receive" as const,
      createdAt: now,
    },
    {
      id: uid("pty"),
      companyId: companyBId,
      name: "Harbour Cafe",
      phone: "9111222333",
      type: "customer" as const,
      openingBalance: 2400,
      balanceType: "to_receive" as const,
      createdAt: now,
    },
  ];

  const items = [
    {
      id: uid("itm"),
      companyId: companyAId,
      name: "LED Bulb 9W",
      sku: "LED-9W",
      unit: "pcs",
      salePrice: 120,
      purchasePrice: 75,
      stockQty: 240,
      taxPercent: 18,
      category: "Electrical",
      createdAt: now,
    },
    {
      id: uid("itm"),
      companyId: companyAId,
      name: "Copper Wire 1.5mm",
      sku: "CW-15",
      unit: "mtr",
      salePrice: 45,
      purchasePrice: 28,
      stockQty: 1000,
      taxPercent: 18,
      category: "Electrical",
      createdAt: now,
    },
    {
      id: uid("itm"),
      companyId: companyAId,
      name: "Switch Board 8M",
      sku: "SB-8M",
      unit: "pcs",
      salePrice: 380,
      purchasePrice: 240,
      stockQty: 65,
      taxPercent: 18,
      category: "Hardware",
      createdAt: now,
    },
    {
      id: uid("itm"),
      companyId: companyBId,
      name: "Paper Cups 200ml",
      sku: "PC-200",
      unit: "pkt",
      salePrice: 90,
      purchasePrice: 55,
      stockQty: 180,
      taxPercent: 5,
      category: "Packaging",
      createdAt: now,
    },
  ];

  const cashId = uid("pay");
  const bankId = uid("pay");
  const payments = [
    {
      id: cashId,
      companyId: companyAId,
      name: "Cash",
      kind: "cash" as const,
      openingBalance: 15000,
    },
    {
      id: bankId,
      companyId: companyAId,
      name: "HDFC Current",
      kind: "bank" as const,
      openingBalance: 125000,
    },
    {
      id: uid("pay"),
      companyId: companyAId,
      name: "UPI",
      kind: "upi" as const,
      openingBalance: 0,
    },
    {
      id: uid("pay"),
      companyId: companyBId,
      name: "Cash",
      kind: "cash" as const,
      openingBalance: 8000,
    },
    {
      id: uid("pay"),
      companyId: companyBId,
      name: "SBI Savings",
      kind: "bank" as const,
      openingBalance: 42000,
    },
  ];

  await db.parties.bulkAdd(parties);
  await db.items.bulkAdd(items);
  await db.paymentTypes.bulkAdd(payments);

  const saleId = uid("txn");
  const purchaseId = uid("txn");
  const payInId = uid("txn");

  const saleLines = [
    {
      id: uid("li"),
      companyId: companyAId,
      transactionId: saleId,
      itemId: items[0].id,
      name: items[0].name,
      qty: 20,
      rate: 120,
      taxPercent: 18,
      amount: 20 * 120 * 1.18,
    },
    {
      id: uid("li"),
      companyId: companyAId,
      transactionId: saleId,
      itemId: items[2].id,
      name: items[2].name,
      qty: 4,
      rate: 380,
      taxPercent: 18,
      amount: 4 * 380 * 1.18,
    },
  ];
  const saleSub = saleLines.reduce((s, l) => s + l.qty * l.rate, 0);
  const saleTax = saleLines.reduce((s, l) => s + l.qty * l.rate * (l.taxPercent / 100), 0);

  const purchaseLines = [
    {
      id: uid("li"),
      companyId: companyAId,
      transactionId: purchaseId,
      itemId: items[1].id,
      name: items[1].name,
      qty: 200,
      rate: 28,
      taxPercent: 18,
      amount: 200 * 28 * 1.18,
    },
  ];
  const purchSub = purchaseLines.reduce((s, l) => s + l.qty * l.rate, 0);
  const purchTax = purchaseLines.reduce(
    (s, l) => s + l.qty * l.rate * (l.taxPercent / 100),
    0,
  );

  await db.transactions.bulkAdd([
    {
      id: saleId,
      companyId: companyAId,
      type: "sale",
      number: "INV-1001",
      date: daysAgo(3),
      partyId: parties[0].id,
      paymentTypeId: cashId,
      notes: "Counter sale",
      subtotal: saleSub,
      taxTotal: saleTax,
      grandTotal: saleSub + saleTax,
      createdAt: now,
    },
    {
      id: purchaseId,
      companyId: companyAId,
      type: "purchase",
      number: "PUR-501",
      date: daysAgo(5),
      partyId: parties[1].id,
      paymentTypeId: bankId,
      notes: "Wire stock refill",
      subtotal: purchSub,
      taxTotal: purchTax,
      grandTotal: purchSub + purchTax,
      createdAt: now,
    },
    {
      id: payInId,
      companyId: companyAId,
      type: "payment_in",
      number: "RCPT-201",
      date: daysAgo(1),
      partyId: parties[0].id,
      paymentTypeId: bankId,
      notes: "Partial collection",
      subtotal: 5000,
      taxTotal: 0,
      grandTotal: 5000,
      createdAt: now,
    },
  ]);

  await db.lineItems.bulkAdd([...saleLines, ...purchaseLines]);

  // Adjust stock for seed txns
  await db.items.update(items[0].id, { stockQty: items[0].stockQty - 20 });
  await db.items.update(items[2].id, { stockQty: items[2].stockQty - 4 });
  await db.items.update(items[1].id, { stockQty: items[1].stockQty + 200 });

  await setMeta("currentCompanyId", companyAId);
  await setMeta("seeded", "1");
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
