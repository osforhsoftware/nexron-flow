# MESMS — Complete Field Name List

Source: `Medical-Equipment-Service-Management/backend/prisma/schema.prisma`

Generated: 2026-11-11 11:53

## model Tenant
- id : String   @id @default(cuid())
- name : String
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- users : User[]
- branches : Branch[]
- customers : Customer[]
- equipment : Equipment[]
- serviceRequests : ServiceRequest[]
- estimates : Estimate[]
- serviceJobs : ServiceJob[]
- inventoryItems : InventoryItem[]
- suppliers : Supplier[]
- purchaseOrders : PurchaseOrder[]
- purchaseReturns : PurchaseReturn[]
- stockTransfers : StockTransfer[]
- stockTransferLines : StockTransferLine[]
- amcContracts : AmcContract[]
- invoices : Invoice[]
- notifications : Notification[]
- auditLogs : AuditLog[]
- settings : TenantSettings?
- roles : Role[]
- roleAssignments : UserRoleAssignment[]
- serviceCatalog : ServiceCatalogItem[]
- estimateRevisions : EstimateRevision[]
- estimateDecisions : EstimateDecision[]
- jobAssignments : JobAssignment[]
- workLogs : JobWorkLog[]
- jobExtras : JobExtra[]
- stockReservations : StockReservation[]
- stockMovements : StockMovement[]
- purchaseReceipts : PurchaseReceipt[]
- invoicePayments : InvoicePayment[]
- storedFiles : StoredFile[]
- documents : Document[]
- qrScans : QrScan[]
- officeAssets : OfficeAsset[]
- officeAssetMaintenance : OfficeAssetMaintenance[]
- projectExpenses : ProjectExpense[]
- referrals : Referral[]
- commissions : Commission[]
- stockPurchaseRequests : StockPurchaseRequest[]
- ticketChangeRequests : ServiceTicketChangeRequest[]
- taxonomyTerms : TaxonomyTerm[]
- taxonomySuppressions : TaxonomySuppression[]
- salesOrders : SalesOrder[]
- salesEnquiries : SalesEnquiry[]
- supplierRFQs : SupplierRFQ[]
- supplierQuotes : SupplierQuote[]
- warrantyClaims : WarrantyClaim[]
- customerContacts : CustomerContact[]
- purchaseShipments : PurchaseShipment[]
- assetTagSequences : AssetTagSequence[]

## model TenantSettings
- id : String   @id @default(cuid())
- tenantId : String   @unique @map("tenant_id")
- logoFileId : String?  @unique @map("logo_file_id")
- supportEmail : String   @default("support@mesms.io") @map("support_email")
- companyAddress : String?  @map("company_address") @db.VarChar(500)
- companyPhone : String?  @map("company_phone") @db.VarChar(40)
- companyWebsite : String?  @map("company_website") @db.VarChar(200)
- defaultTaxRate : Decimal  @default(0) @map("default_tax_rate") @db.Decimal(5, 2)
- marginMode : String   @default("fixed") @map("margin_mode") @db.VarChar(16)
- minMarginPct : Decimal  @default(20) @map("min_margin_pct") @db.Decimal(5, 2)
- amcRenewalReminders : Boolean  @default(true) @map("amc_renewal_reminders")
- lowStockAlerts : Boolean  @default(true) @map("low_stock_alerts")
- autoReserveOnApproval : Boolean  @default(true) @map("auto_reserve_on_approval")
- autoGenerateReport : Boolean  @default(true) @map("auto_generate_report")
- autoAssignInspectorOnCreate : Boolean @default(false) @map("auto_assign_inspector_on_create")
- autoAssignCoordinatorAfterInspection : Boolean @default(true) @map("auto_assign_coordinator_after_inspection")
- autoAssignEstimatorAfterInspection : Boolean @default(true) @map("auto_assign_estimator_after_inspection")
- autoAssignEngineerOnApproval : Boolean @default(false) @map("auto_assign_engineer_on_approval")
- skipApprovals : Boolean @default(true) @map("skip_approvals")
- guidedSetupFlow : Boolean @default(true) @map("guided_setup_flow")
- defaultCoordinatorUserId : String? @map("default_coordinator_user_id")
- defaultInspectorUserId : String? @map("default_inspector_user_id")
- defaultEstimatorUserId : String? @map("default_estimator_user_id")
- defaultEngineerUserId : String? @map("default_engineer_user_id")
- assetTagPrefix : String?  @map("asset_tag_prefix") @db.VarChar(20)
- qaChecklistDefaults : Json     @default("[]") @map("qa_checklist_defaults")
- rbacMatrix : Json     @default("{

## model AssetTagSequence
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- prefix : String   @db.VarChar(20)
- nextSequence : Int      @default(1001) @map("next_sequence")
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

## model User
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- name : String
- username : String
- email : String
- passwordHash : String   @map("password_hash")
- role : UserRole
- phone : String?
- isActive : Boolean  @default(true) @map("is_active")
- branchId : String?  @map("branch_id")
- avatarColor : String   @default("205 90% 42%") @map("avatar_color")
- customerId : String?  @map("customer_id")

## model PasswordResetToken
- id : String    @id @default(cuid())
- userId : String    @map("user_id")
- tokenHash : String    @unique @map("token_hash")
- expiresAt : DateTime  @map("expires_at")
- usedAt : DateTime? @map("used_at")
- createdAt : DateTime  @default(now()) @map("created_at")
- user : User @relation(fields: [userId], references: [id], onDelete: Cascade)

## enum UserRole
admin, coordinator, inspector, estimator, sales, engineer, inventory, billing, qa, customer

## model Role
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- key : String
- name : String
- description : String?
- permissions : Json     @default("{

## model UserRoleAssignment
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- userId : String   @map("user_id")
- roleId : String   @map("role_id")
- branchId : String?  @map("branch_id")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- user : User   @relation(fields: [userId], references: [id], onDelete: Cascade)
- role : Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)

## model Branch
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- name : String
- city : String
- phone : String
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- catalogItems : ServiceCatalogItem[]
- officeAssets : OfficeAsset[]
- projectExpenses : ProjectExpense[]
- outboundTransfers : StockTransfer[] @relation("TransferFromBranch")
- inboundTransfers : StockTransfer[] @relation("TransferToBranch")

## model Customer
- id : String       @id @default(cuid())
- tenantId : String       @map("tenant_id")
- reference : String
- name : String
- type : String       @default("")
- typeOther : String?      @map("type_other")
- contactPerson : String       @map("contact_person")
- email : String
- phone : String       @default("")
- address : String       @default("")
- city : String
- country : String       @default("")
- licenseGst : String?      @map("license_gst")
- note : String?      @map("note")
- restrictions : String?      @db.Text
- paymentTerms : String?      @map("payment_terms")
- creditLimit : Decimal?     @map("credit_limit") @db.Decimal(12, 2)
- priceCategory : String?      @map("price_category")
- deliveryAddress : String?      @map("delivery_address")
- additionalFields : Json?        @map("additional_fields")
- branchId : String       @map("branch_id")
- equipmentCount : Int          @default(0) @map("equipment_count")
- activeJobs : Int          @default(0) @map("active_jobs")
- status : EntityStatus @default(active)
- createdAt : DateTime     @default(now()) @map("created_at")
- updatedAt : DateTime     @updatedAt @map("updated_at")
- tenant : Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- equipment : Equipment[]
- serviceRequests : ServiceRequest[]
- estimates : Estimate[]
- serviceJobs : ServiceJob[]
- invoices : Invoice[]
- salesOrders : SalesOrder[]
- referrals : Referral[]
- contacts : CustomerContact[]

## enum EntityStatus
active, inactive

## model CustomerContact
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- customerId : String   @map("customer_id")
- name : String
- role : String   @default("")
- email : String   @default("")
- phone : String   @default("")
- isPrimary : Boolean  @default(false) @map("is_primary")
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- customer : Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)

## model Equipment
- id : String                 @id @default(cuid())
- tenantId : String                 @map("tenant_id")
- assetTag : String                 @map("asset_tag")
- name : String
- model : String                 @default("")
- manufacturer : String                 @default("")
- category : String                 @default("")
- serialNumber : String                 @map("serial_number")
- partNumber : String?                @map("part_number")
- partDescription : String?                @db.Text @map("part_description")
- additionalNote : String?                @db.Text @map("additional_note")
- customerId : String?                @map("customer_id")
- customerName : String                 @default("") @map("customer_name")
- branchId : String                 @map("branch_id")
- location : String                 @default("")
- installDate : DateTime?              @map("install_date")
- warrantyStart : DateTime?              @map("warranty_start")
- warrantyEnd : DateTime?              @map("warranty_end")
- noMachineWarranty : Boolean                @default(false) @map("no_machine_warranty")
- serviceWarrantyStart : DateTime?              @map("service_warranty_start")
- serviceWarrantyEnd : DateTime?              @map("service_warranty_end")
- noServiceWarranty : Boolean                @default(false) @map("no_service_warranty")
- amcStatus : AmcStatus              @default(none) @map("amc_status")
- condition : String                 @default("operational")
- currentStatus : EquipmentCurrentStatus @default(in_service) @map("current_status")
- purchaseSaleHistory : String?                @db.Text @map("purchase_sale_history")
- lastServiceDate : DateTime?              @map("last_service_date")
- createdAt : DateTime               @default(now()) @map("created_at")
- updatedAt : DateTime               @updatedAt @map("updated_at")
- tenant : Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- customer : Customer?        @relation(fields: [customerId], references: [id])
- serviceRequests : ServiceRequest[]
- estimates : Estimate[]
- serviceJobs : ServiceJob[]
- qrScans : QrScan[]

## enum AmcStatus
active, expiring, expired, none

## enum EquipmentCurrentStatus
in_service, in_repair, in_storage, decommissioned, disposed

## enum TaxonomyType
equipment_category, equipment_condition, customer_type, inventory_category, inventory_subcategory, expense_category

## model TaxonomyTerm
- id : String       @id @default(cuid())
- tenantId : String       @map("tenant_id")
- type : TaxonomyType
- name : String
- slug : String
- description : String?      @db.Text
- parentId : String?      @map("parent_id")
- sortOrder : Int          @default(0) @map("sort_order")
- isActive : Boolean      @default(true) @map("is_active")
- isSystem : Boolean      @default(false) @map("is_system")
- createdAt : DateTime     @default(now()) @map("created_at")
- updatedAt : DateTime     @updatedAt @map("updated_at")
- tenant : Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- parent : TaxonomyTerm?   @relation("TaxonomyHierarchy", fields: [parentId], references: [id], onDelete: SetNull)
- children : TaxonomyTerm[]  @relation("TaxonomyHierarchy")

## model TaxonomySuppression
- id : String       @id @default(cuid())
- tenantId : String       @map("tenant_id")
- type : TaxonomyType
- slug : String
- createdAt : DateTime     @default(now()) @map("created_at")
- tenant : Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

## model ServiceCatalogItem
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- branchId : String?  @map("branch_id")
- code : String
- name : String
- description : String?
- category : String
- unit : String   @default("service")
- unitPrice : Decimal  @default(0) @map("unit_price") @db.Decimal(12, 2)
- taxRate : Decimal  @default(0) @map("tax_rate") @db.Decimal(5, 2)
- isActive : Boolean  @default(true) @map("is_active")
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant                     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- branch : Branch?                    @relation(fields: [branchId], references: [id], onDelete: SetNull)
- estimateLines : EstimateLineItem[]
- invoiceLines : InvoiceLineItem[]
- inspectionRecommendations : InspectionRecommendation[]

## model ServiceRequest
- id : String        @id @default(cuid())
- tenantId : String        @map("tenant_id")
- reference : String
- customerId : String        @map("customer_id")
- customerName : String        @map("customer_name")
- equipmentId : String?       @map("equipment_id")
- equipmentName : String?       @map("equipment_name")
- branchId : String        @map("branch_id")
- type : ServiceType?
- typeOther : String?       @map("type_other")
- priority : Priority
- status : ServiceStatus @default(new)
- description : String        @default("")
- additionalFields : Json?      @map("additional_fields")
- createdBy : String        @map("created_by")
- assignedTo : String?       @map("assigned_to")
- assignedName : String?       @map("assigned_name")
- assignedInspectorId : String?       @map("assigned_inspector_id")
- assignedEstimatorId : String?       @map("assigned_estimator_id")
- assignedEngineerId : String?       @map("assigned_engineer_id")
- slaDue : DateTime      @map("sla_due")
- completedAt : DateTime?     @map("completed_at")
- createdAt : DateTime      @default(now()) @map("created_at")
- updatedAt : DateTime      @updatedAt @map("updated_at")
- tenant : Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- customer : Customer                  @relation(fields: [customerId], references: [id])
- equipment : Equipment?                @relation(fields: [equipmentId], references: [id])
- timelineEvents : TimelineEvent[]
- equipmentItems : ServiceRequestEquipment[]
- inspectionReport : InspectionReport?
- estimates : Estimate[]
- serviceJobs : ServiceJob[]
- invoices : Invoice[]
- referrals : Referral[]
- stockPurchaseRequests : StockPurchaseRequest[]
- changeRequests : ServiceTicketChangeRequest[]

## model ServiceTicketChangeRequest
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- serviceRequestId : String    @map("service_request_id")
- jobId : String?   @map("job_id")
- requestedBy : String    @map("requested_by")
- status : String    @default("pending")
- description : String    @db.Text
- items : Json      @default("[]")
- reviewNote : String?   @map("review_note") @db.Text
- reviewedBy : String?   @map("reviewed_by")
- reviewedAt : DateTime? @map("reviewed_at")
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- serviceRequest : ServiceRequest @relation(fields: [serviceRequestId], references: [id], onDelete: Cascade)
- job : ServiceJob?    @relation(fields: [jobId], references: [id], onDelete: SetNull)

## model ServiceRequestEquipment
- id : String   @id @default(cuid())
- serviceRequestId : String   @map("service_request_id")
- equipmentId : String   @map("equipment_id")
- equipmentName : String   @map("equipment_name")
- assetTag : String   @default("") @map("asset_tag")
- createdAt : DateTime @default(now()) @map("created_at")
- serviceRequest : ServiceRequest @relation(fields: [serviceRequestId], references: [id], onDelete: Cascade)

## model InspectionReport
- id : String    @id @default(cuid())
- serviceRequestId : String    @unique @map("service_request_id")
- findings : String
- recommendation : String
- severity : String
- machineCondition : String?   @map("machine_condition")
- errorCodes : Json?     @map("error_codes")
- checklist : Json?
- measurements : Json?
- calibrationStatus : String?   @map("calibration_status")
- technicianRemarks : String?   @map("technician_remarks") @db.Text
- additionalFields : Json?     @map("additional_fields")
- version : Int       @default(1)
- submittedAt : DateTime? @map("submitted_at")
- reportedBy : String    @map("reported_by")
- reportedAt : DateTime  @default(now()) @map("reported_at")
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- serviceRequest : ServiceRequest             @relation(fields: [serviceRequestId], references: [id], onDelete: Cascade)
- recommendations : InspectionRecommendation[]
- attachments : InspectionAttachment[]

## model InspectionRecommendation
- id : String   @id @default(cuid())
- inspectionReportId : String   @map("inspection_report_id")
- catalogItemId : String?  @map("catalog_item_id")
- inventoryItemId : String?  @map("inventory_item_id")
- type : String   @default("other")
- title : String
- description : String   @db.Text
- priority : Priority @default(medium)
- quantity : Decimal  @default(1) @db.Decimal(12, 3)
- estimatedCost : Decimal  @default(0) @map("estimated_cost") @db.Decimal(12, 2)
- accepted : Boolean?
- procurementStatus : String?  @map("procurement_status")
- createdAt : DateTime @default(now()) @map("created_at")
- inspectionReport : InspectionReport    @relation(fields: [inspectionReportId], references: [id], onDelete: Cascade)
- catalogItem : ServiceCatalogItem? @relation(fields: [catalogItemId], references: [id], onDelete: SetNull)
- inventoryItem : InventoryItem?      @relation(fields: [inventoryItemId], references: [id], onDelete: SetNull)

## model InspectionAttachment
- id : String   @id @default(cuid())
- inspectionReportId : String   @map("inspection_report_id")
- fileId : String   @map("file_id")
- caption : String?
- kind : String   @default("evidence")
- createdAt : DateTime @default(now()) @map("created_at")
- inspectionReport : InspectionReport @relation(fields: [inspectionReportId], references: [id], onDelete: Cascade)
- file : StoredFile       @relation(fields: [fileId], references: [id], onDelete: Restrict)

## model TimelineEvent
- id : String   @id @default(cuid())
- requestId : String   @map("request_id")
- at : DateTime @default(now())
- actor : String
- action : String
- note : String?
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- request : ServiceRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)

## enum ServiceType
Repair, Maintenance, Calibration, Inspection, Installation, Other

## enum Priority
low, medium, high, critical

## enum ServiceStatus
new, inspection, estimate, pending_approval, assigned_engineer, change_pending_approval, pending_final_approval, pending_invoice, invoiced, closed, cancelled, approval, inProgress, completed, finished

## model Estimate
- id : String         @id @default(cuid())
- tenantId : String         @map("tenant_id")
- serviceRequestId : String?        @map("service_request_id")
- customerId : String?        @map("customer_id")
- equipmentId : String?        @map("equipment_id")
- reference : String
- requestRef : String         @map("request_ref")
- customerName : String         @map("customer_name")
- equipmentName : String         @map("equipment_name")
- laborCost : Decimal        @default(0) @map("labor_cost") @db.Decimal(12, 2)
- partsCost : Decimal        @default(0) @map("parts_cost") @db.Decimal(12, 2)
- subtotal : Decimal        @default(0) @db.Decimal(12, 2)
- discount : Decimal        @default(0) @db.Decimal(12, 2)
- tax : Decimal        @default(0) @db.Decimal(12, 2)
- total : Decimal        @default(0) @db.Decimal(12, 2)
- status : EstimateStatus @default(draft)
- validUntil : DateTime       @map("valid_until")
- revision : Int            @default(1)
- terms : String?        @db.Text
- notes : String?        @db.Text
- customerSummary : String?        @map("customer_summary") @db.VarChar(200)
- currency : String         @default("INR")
- warranty : String?        @db.Text
- estimatedCompletion : DateTime?   @map("estimated_completion")
- salespersonId : String?        @map("salesperson_id")
- sentAt : DateTime?      @map("sent_at")
- approvedAt : DateTime?      @map("approved_at")
- createdAt : DateTime       @default(now()) @map("created_at")
- updatedAt : DateTime       @updatedAt @map("updated_at")
- tenant : Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- serviceRequest : ServiceRequest?    @relation(fields: [serviceRequestId], references: [id], onDelete: SetNull)
- customer : Customer?          @relation(fields: [customerId], references: [id], onDelete: SetNull)
- equipment : Equipment?         @relation(fields: [equipmentId], references: [id], onDelete: SetNull)
- lineItems : EstimateLineItem[]
- revisions : EstimateRevision[]
- decisions : EstimateDecision[]
- serviceJobs : ServiceJob[]
- reservations : StockReservation[]
- invoices : Invoice[]
- salesOrder : SalesOrder?

## model EstimateRevision
- id : String         @id @default(cuid())
- tenantId : String         @map("tenant_id")
- estimateId : String         @map("estimate_id")
- revision : Int
- subtotal : Decimal        @db.Decimal(12, 2)
- discount : Decimal        @default(0) @db.Decimal(12, 2)
- tax : Decimal        @default(0) @db.Decimal(12, 2)
- total : Decimal        @db.Decimal(12, 2)
- status : EstimateStatus @default(draft)
- terms : String?        @db.Text
- notes : String?        @db.Text
- snapshot : Json
- createdBy : String         @map("created_by")
- createdAt : DateTime       @default(now()) @map("created_at")
- tenant : Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- estimate : Estimate           @relation(fields: [estimateId], references: [id], onDelete: Cascade)
- lines : EstimateLineItem[]

## model EstimateLineItem
- id : String   @id @default(cuid())
- estimateId : String   @map("estimate_id")
- revisionId : String?  @map("revision_id")
- catalogItemId : String?  @map("catalog_item_id")
- inventoryItemId : String?  @map("inventory_item_id")
- type : String
- description : String
- partNumber : String?  @map("part_number")
- quantity : Decimal  @default(1) @db.Decimal(12, 3)
- unitPrice : Decimal  @map("unit_price") @db.Decimal(12, 2)
- taxRate : Decimal  @default(0) @map("tax_rate") @db.Decimal(5, 2)
- discount : Decimal  @default(0) @db.Decimal(12, 2)
- lineTotal : Decimal  @map("line_total") @db.Decimal(12, 2)
- createdAt : DateTime @default(now()) @map("created_at")
- estimate : Estimate            @relation(fields: [estimateId], references: [id], onDelete: Cascade)
- revision : EstimateRevision?   @relation(fields: [revisionId], references: [id], onDelete: Cascade)
- catalogItem : ServiceCatalogItem? @relation(fields: [catalogItemId], references: [id], onDelete: SetNull)
- inventoryItem : InventoryItem?      @relation(fields: [inventoryItemId], references: [id], onDelete: SetNull)
- invoiceLines : InvoiceLineItem[]

## model EstimateDecision
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- estimateId : String   @map("estimate_id")
- decision : String
- note : String?  @db.Text
- actorId : String   @map("actor_id")
- actorRole : String   @map("actor_role")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- estimate : Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)

## enum EstimateStatus
draft, sent, pendingAdminApproval, approved, rejected, revision, converted

## model SalesOrder
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- estimateId : String?  @unique @map("estimate_id")
- customerId : String   @map("customer_id")
- salespersonId : String?  @map("salesperson_id")
- branchId : String?  @map("branch_id")
- reference : String
- customerName : String   @map("customer_name")
- salespersonName : String   @map("salesperson_name")
- status : String   @default("confirmed")
- deliveryStatus : String   @default("pending") @map("delivery_status")
- paymentStatus : String   @default("unpaid") @map("payment_status")
- subtotal : Decimal  @db.Decimal(12, 2)
- discount : Decimal  @default(0) @db.Decimal(12, 2)
- tax : Decimal  @default(0) @db.Decimal(12, 2)
- total : Decimal  @db.Decimal(12, 2)
- notes : String?  @db.Text
- orderedAt : DateTime @default(now()) @map("ordered_at")
- deliveredAt : DateTime? @map("delivered_at")
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- estimate : Estimate?          @relation(fields: [estimateId], references: [id], onDelete: Restrict)
- customer : Customer           @relation(fields: [customerId], references: [id], onDelete: Restrict)
- lines : SalesOrderLine[]
- invoices : Invoice[]
- reservations : StockReservation[]
- commissions : Commission[]

## model SalesOrderLine
- id : String   @id @default(cuid())
- salesOrderId : String   @map("sales_order_id")
- inventoryItemId : String?  @map("inventory_item_id")
- catalogItemId : String?  @map("catalog_item_id")
- type : String
- description : String
- sku : String?
- quantity : Decimal  @default(1) @db.Decimal(12, 3)
- unitPrice : Decimal  @map("unit_price") @db.Decimal(12, 2)
- discount : Decimal  @default(0) @db.Decimal(12, 2)
- taxRate : Decimal  @default(0) @map("tax_rate") @db.Decimal(5, 2)
- lineTotal : Decimal  @map("line_total") @db.Decimal(12, 2)
- createdAt : DateTime @default(now()) @map("created_at")
- salesOrder : SalesOrder      @relation(fields: [salesOrderId], references: [id], onDelete: Cascade)
- inventoryItem : InventoryItem?  @relation(fields: [inventoryItemId], references: [id], onDelete: SetNull)

## model ServiceJob
- id : String      @id @default(cuid())
- tenantId : String      @map("tenant_id")
- serviceRequestId : String?     @map("service_request_id")
- estimateId : String?     @map("estimate_id")
- customerId : String?     @map("customer_id")
- equipmentId : String?     @map("equipment_id")
- reference : String
- requestRef : String      @map("request_ref")
- customerName : String      @map("customer_name")
- equipmentName : String      @map("equipment_name")
- engineer : String
- engineerId : String?     @map("engineer_id")
- type : ServiceType
- typeOther : String?     @map("type_other")
- status : JobStatus   @default(scheduled)
- scheduledFor : DateTime    @map("scheduled_for")
- progress : Int         @default(0)
- additionalFields : Json?       @map("additional_fields")
- stageDetails : Json?       @map("stage_details")
- billingVerifiedAt : DateTime?   @map("billing_verified_at")
- billingVerifiedBy : String?     @map("billing_verified_by")
- completedAt : DateTime?   @map("completed_at")
- originalJobId : String?     @map("original_job_id")
- isRework : Boolean     @default(false) @map("is_rework")
- createdAt : DateTime    @default(now()) @map("created_at")
- updatedAt : DateTime    @updatedAt @map("updated_at")
- tenant : Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- originalJob : ServiceJob?         @relation("JobRework", fields: [originalJobId], references: [id], onDelete: SetNull)
- reworkJobs : ServiceJob[]        @relation("JobRework")
- serviceRequest : ServiceRequest?     @relation(fields: [serviceRequestId], references: [id], onDelete: SetNull)
- estimate : Estimate?           @relation(fields: [estimateId], references: [id], onDelete: SetNull)
- customer : Customer?           @relation(fields: [customerId], references: [id], onDelete: SetNull)
- equipment : Equipment?          @relation(fields: [equipmentId], references: [id], onDelete: SetNull)
- photos : JobPhoto[]
- partsRequests : JobPartsRequest[]
- signature : JobSignature?
- stockDeductions : JobStockDeduction[]
- activities : JobActivity[]
- assignments : JobAssignment[]
- workLogs : JobWorkLog[]
- extras : JobExtra[]
- reservations : StockReservation[]
- stockMovements : StockMovement[]
- invoices : Invoice[]
- projectExpenses : ProjectExpense[]
- stockPurchaseRequests : StockPurchaseRequest[]
- changeRequests : ServiceTicketChangeRequest[]

## model JobAssignment
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- jobId : String    @map("job_id")
- userId : String    @map("user_id")
- role : String
- isLead : Boolean   @default(false) @map("is_lead")
- assignedBy : String    @map("assigned_by")
- assignedAt : DateTime  @default(now()) @map("assigned_at")
- endedAt : DateTime? @map("ended_at")
- tenant : Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- job : ServiceJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
- user : User       @relation(fields: [userId], references: [id], onDelete: Restrict)

## model JobWorkLog
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- jobId : String    @map("job_id")
- userId : String    @map("user_id")
- startedAt : DateTime  @map("started_at")
- endedAt : DateTime? @map("ended_at")
- minutes : Int       @default(0)
- workPerformed : String    @map("work_performed") @db.Text
- testingResult : String?   @map("testing_result") @db.Text
- calibrationResult : String?   @map("calibration_result") @db.Text
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- job : ServiceJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
- user : User       @relation(fields: [userId], references: [id], onDelete: Restrict)

## model JobExtra
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- jobId : String    @map("job_id")
- inventoryItemId : String?   @map("inventory_item_id")
- description : String
- type : String    @default("product")
- reason : String    @db.Text
- quantity : Decimal   @default(1) @db.Decimal(12, 3)
- unitPrice : Decimal   @map("unit_price") @db.Decimal(12, 2)
- taxRate : Decimal   @default(0) @map("tax_rate") @db.Decimal(5, 2)
- status : String    @default("pending")
- approvedBy : String?   @map("approved_by")
- approvedAt : DateTime? @map("approved_at")
- createdBy : String    @map("created_by")
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- job : ServiceJob        @relation(fields: [jobId], references: [id], onDelete: Cascade)
- inventoryItem : InventoryItem?    @relation(fields: [inventoryItemId], references: [id], onDelete: SetNull)
- invoiceLines : InvoiceLineItem[]

## model JobPhoto
- id : String   @id @default(cuid())
- jobId : String   @map("job_id")
- filename : String
- mimeType : String   @map("mime_type")
- dataUrl : String   @map("data_url") @db.Text
- fileId : String?  @map("file_id")
- caption : String?  @db.VarChar(500)
- uploadedBy : String   @map("uploaded_by")
- createdAt : DateTime @default(now()) @map("created_at")
- job : ServiceJob  @relation(fields: [jobId], references: [id], onDelete: Cascade)
- file : StoredFile? @relation("JobPhotoFile", fields: [fileId], references: [id], onDelete: SetNull)

## model JobPartsRequest
- id : String    @id @default(cuid())
- jobId : String    @map("job_id")
- notes : String
- status : String    @default("pending")
- requestedBy : String    @map("requested_by")
- approvedBy : String?   @map("approved_by")
- approvedAt : DateTime? @map("approved_at")
- rejectedReason : String?   @map("rejected_reason") @db.Text
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- job : ServiceJob            @relation(fields: [jobId], references: [id], onDelete: Cascade)
- lines : JobPartsRequestLine[]

## model JobPartsRequestLine
- id : String   @id @default(cuid())
- requestId : String   @map("request_id")
- inventoryItemId : String   @map("inventory_item_id")
- itemName : String   @map("item_name")
- sku : String
- qtyRequested : Int      @map("qty_requested")
- qtyApproved : Int      @default(0) @map("qty_approved")
- qtyIssued : Int      @default(0) @map("qty_issued")
- qtyConsumed : Int      @default(0) @map("qty_consumed")
- qtyReturned : Int      @default(0) @map("qty_returned")
- qtyScrapped : Int      @default(0) @map("qty_scrapped")
- unitCost : Decimal  @default(0) @map("unit_cost") @db.Decimal(12, 2)
- sellingPrice : Decimal  @default(0) @map("selling_price") @db.Decimal(12, 2)
- batchNumber : String?  @map("batch_number")
- serialNumbers : String?  @map("serial_numbers")
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- request : JobPartsRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
- inventoryItem : InventoryItem   @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)

## model JobSignature
- id : String   @id @default(cuid())
- jobId : String   @unique @map("job_id")
- customerName : String   @map("customer_name")
- signatureData : String?  @map("signature_data") @db.Text
- fileId : String?  @map("file_id")
- capturedBy : String   @map("captured_by")
- capturedAt : DateTime @default(now()) @map("captured_at")
- job : ServiceJob  @relation(fields: [jobId], references: [id], onDelete: Cascade)
- file : StoredFile? @relation("JobSignatureFile", fields: [fileId], references: [id], onDelete: SetNull)

## model JobStockDeduction
- id : String   @id @default(cuid())
- jobId : String   @map("job_id")
- inventoryItemId : String   @map("inventory_item_id")
- itemName : String   @map("item_name")
- sku : String
- quantity : Int
- deductedBy : String   @map("deducted_by")
- createdAt : DateTime @default(now()) @map("created_at")
- job : ServiceJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

## model JobActivity
- id : String   @id @default(cuid())
- jobId : String   @map("job_id")
- actor : String
- action : String
- note : String?
- createdAt : DateTime @default(now()) @map("created_at")
- job : ServiceJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

## enum JobStatus
scheduled, inProgress, partsPending, review, completed, delivery

## model InventoryItem
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- sku : String
- name : String
- itemClass : String   @default("spare_part") @map("item_class")
- category : String
- subcategory : String?
- description : String?  @db.Text
- manufacturer : String   @default("")
- compatibleModels : String?  @db.Text @map("compatible_models")
- branchId : String   @map("branch_id")
- inStock : Int      @default(0) @map("in_stock")
- reserved : Int      @default(0)
- issued : Int      @default(0)
- damaged : Int      @default(0)
- reorderLevel : Int      @default(0) @map("reorder_level")
- maxLevel : Int      @default(0) @map("max_level")
- binLocation : String   @default("") @map("bin_location")
- trackBatches : Boolean  @default(false) @map("track_batches")
- trackSerials : Boolean  @default(false) @map("track_serials")
- unitCost : Decimal  @default(0) @map("unit_cost") @db.Decimal(12, 2)
- sellingPrice : Decimal  @default(0) @map("selling_price") @db.Decimal(12, 2)
- deliveryCharge : Decimal  @default(0) @map("delivery_charge") @db.Decimal(12, 2)
- deliveryChargeType : String   @default("flat") @map("delivery_charge_type")
- unitOfMeasure : String   @default("pcs") @map("unit_of_measure")
- supplier : String
- supplierId : String?  @map("supplier_id")
- additionalFields : Json?    @map("additional_fields")
- status : EntityStatus @default(active)
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant                     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- supplierRecord : Supplier?                  @relation(fields: [supplierId], references: [id], onDelete: SetNull)
- estimateLines : EstimateLineItem[]
- jobExtras : JobExtra[]
- reservations : StockReservation[]
- movements : StockMovement[]
- partsRequestLines : JobPartsRequestLine[]
- purchaseOrderLines : PurchaseOrderLine[]
- receiptLines : PurchaseReceiptLine[]
- purchaseReturnLines : PurchaseReturnLine[]
- inspectionRecommendations : InspectionRecommendation[]
- transferSourceLines : StockTransferLine[]        @relation("TransferSourceItem")
- transferDestinationLines : StockTransferLine[]        @relation("TransferDestinationItem")
- images : InventoryItemImage[]
- stockPurchaseRequests : StockPurchaseRequest[]
- salesOrderLines : SalesOrderLine[]

## model InventoryItemImage
- id : String   @id @default(cuid())
- inventoryItemId : String   @map("inventory_item_id")
- fileId : String   @map("file_id")
- sortOrder : Int      @default(0) @map("sort_order")
- createdAt : DateTime @default(now()) @map("created_at")
- inventoryItem : InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
- file : StoredFile    @relation("InventoryItemImageFile", fields: [fileId], references: [id], onDelete: Restrict)

## model StockPurchaseRequest
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- inventoryItemId : String    @map("inventory_item_id")
- quantity : Int
- status : String    @default("open")
- requestedBy : String    @map("requested_by")
- serviceRequestId : String?   @map("service_request_id")
- jobId : String?   @map("job_id")
- purchaseOrderId : String?   @map("purchase_order_id")
- note : String?   @db.Text
- convertedAt : DateTime? @map("converted_at")
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- inventoryItem : InventoryItem  @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)
- serviceRequest : ServiceRequest? @relation(fields: [serviceRequestId], references: [id], onDelete: SetNull)
- job : ServiceJob?    @relation(fields: [jobId], references: [id], onDelete: SetNull)
- purchaseOrder : PurchaseOrder? @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)

## model StockReservation
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- inventoryItemId : String    @map("inventory_item_id")
- estimateId : String?   @map("estimate_id")
- salesOrderId : String?   @map("sales_order_id")
- jobId : String?   @map("job_id")
- requestedQuantity : Int       @default(0) @map("requested_quantity")
- shortageQuantity : Int       @default(0) @map("shortage_quantity")
- quantity : Int
- consumed : Int       @default(0)
- released : Int       @default(0)
- status : String    @default("active")
- purpose : String?   @db.Text
- reservedBy : String    @map("reserved_by")
- expiresAt : DateTime? @map("expires_at")
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- inventoryItem : InventoryItem   @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)
- estimate : Estimate?       @relation(fields: [estimateId], references: [id], onDelete: SetNull)
- salesOrder : SalesOrder?     @relation(fields: [salesOrderId], references: [id], onDelete: SetNull)
- job : ServiceJob?     @relation(fields: [jobId], references: [id], onDelete: SetNull)
- movements : StockMovement[]

## model StockMovement
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- inventoryItemId : String   @map("inventory_item_id")
- reservationId : String?  @map("reservation_id")
- jobId : String?  @map("job_id")
- type : String
- quantity : Int
- balanceAfter : Int      @map("balance_after")
- referenceType : String?  @map("reference_type")
- referenceId : String?  @map("reference_id")
- reason : String?
- batchNumber : String?  @map("batch_number")
- serialNumber : String?  @map("serial_number")
- actorId : String   @map("actor_id")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- inventoryItem : InventoryItem     @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)
- reservation : StockReservation? @relation(fields: [reservationId], references: [id], onDelete: SetNull)
- job : ServiceJob?       @relation(fields: [jobId], references: [id], onDelete: SetNull)

## model Supplier
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- name : String
- contact : String
- email : String
- phone : String
- address : String?  @db.Text
- category : String
- currency : String   @default("INR")
- paymentTerms : String?  @map("payment_terms")
- deliveryLeadDays : Int?     @map("delivery_lead_days")
- rating : Decimal  @default(0) @db.Decimal(3, 1)
- openOrders : Int      @default(0) @map("open_orders")
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- purchaseOrders : PurchaseOrder[]
- purchaseReturns : PurchaseReturn[]
- inventoryItems : InventoryItem[]
- supplierRFQs : SupplierRFQ[]

## model PurchaseOrder
- id : String              @id @default(cuid())
- tenantId : String              @map("tenant_id")
- supplierId : String?             @map("supplier_id")
- branchId : String?             @map("branch_id")
- reference : String
- supplier : String
- supplierReference : String?             @map("supplier_reference")
- currency : String              @default("INR")
- items : Int                 @default(0)
- total : Decimal             @default(0) @db.Decimal(12, 2)
- freightCost : Decimal?            @map("freight_cost") @db.Decimal(12, 2)
- customsCost : Decimal?            @map("customs_cost") @db.Decimal(12, 2)
- insuranceCost : Decimal?            @map("insurance_cost") @db.Decimal(12, 2)
- landedCostTotal : Decimal?            @map("landed_cost_total") @db.Decimal(12, 2)
- status : PurchaseOrderStatus @default(draft)
- expectedDate : DateTime            @map("expected_date")
- createdAt : DateTime            @default(now()) @map("created_at")
- updatedAt : DateTime            @updatedAt @map("updated_at")
- tenant : Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- supplierRecord : Supplier?              @relation(fields: [supplierId], references: [id], onDelete: SetNull)
- lineItems : PurchaseOrderLine[]
- receipts : PurchaseReceipt[]
- purchaseReturns : PurchaseReturn[]
- stockPurchaseRequests : StockPurchaseRequest[]
- shipment : PurchaseShipment?

## model PurchaseShipment
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- purchaseOrderId : String    @unique @map("purchase_order_id")
- courier : String?
- trackingNumber : String?   @map("tracking_number")
- freightCost : Decimal?  @map("freight_cost") @db.Decimal(12, 2)
- customsInfo : String?   @map("customs_info") @db.Text
- etd : DateTime? @map("etd")
- eta : DateTime? @map("eta")
- notes : String?   @db.Text
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- purchaseOrder : PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)

## model PurchaseOrderLine
- id : String   @id @default(cuid())
- purchaseOrderId : String   @map("purchase_order_id")
- inventoryItemId : String?  @map("inventory_item_id")
- sku : String
- description : String
- quantityOrdered : Int      @map("quantity_ordered")
- quantityReceived : Int      @default(0) @map("quantity_received")
- quantityReturned : Int      @default(0) @map("quantity_returned")
- unitCost : Decimal  @map("unit_cost") @db.Decimal(12, 2)
- taxRate : Decimal  @default(0) @map("tax_rate") @db.Decimal(5, 2)
- lineTotal : Decimal  @map("line_total") @db.Decimal(12, 2)
- createdAt : DateTime @default(now()) @map("created_at")
- purchaseOrder : PurchaseOrder         @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
- inventoryItem : InventoryItem?        @relation(fields: [inventoryItemId], references: [id], onDelete: SetNull)
- receiptLines : PurchaseReceiptLine[]
- returnLines : PurchaseReturnLine[]

## model PurchaseReceipt
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- purchaseOrderId : String   @map("purchase_order_id")
- reference : String
- receivedBy : String   @map("received_by")
- receivedAt : DateTime @default(now()) @map("received_at")
- notes : String?
- tenant : Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- purchaseOrder : PurchaseOrder         @relation(fields: [purchaseOrderId], references: [id], onDelete: Restrict)
- lines : PurchaseReceiptLine[]

## model PurchaseReceiptLine
- id : String   @id @default(cuid())
- receiptId : String   @map("receipt_id")
- purchaseOrderLineId : String   @map("purchase_order_line_id")
- inventoryItemId : String   @map("inventory_item_id")
- quantity : Int
- unitCost : Decimal  @map("unit_cost") @db.Decimal(12, 2)
- createdAt : DateTime @default(now()) @map("created_at")
- receipt : PurchaseReceipt   @relation(fields: [receiptId], references: [id], onDelete: Cascade)
- purchaseOrderLine : PurchaseOrderLine @relation(fields: [purchaseOrderLineId], references: [id], onDelete: Restrict)
- inventoryItem : InventoryItem     @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)

## enum PurchaseOrderStatus
draft, sent, partial, closed, cancelled

## model PurchaseReturn
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- purchaseOrderId : String   @map("purchase_order_id")
- supplierId : String?  @map("supplier_id")
- reference : String
- reason : String?
- notes : String?  @db.Text
- status : String   @default("posted")
- returnedBy : String   @map("returned_by")
- returnedAt : DateTime @default(now()) @map("returned_at")
- items : Int      @default(0)
- total : Decimal  @default(0) @db.Decimal(12, 2)
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- purchaseOrder : PurchaseOrder       @relation(fields: [purchaseOrderId], references: [id], onDelete: Restrict)
- supplier : Supplier?           @relation(fields: [supplierId], references: [id], onDelete: SetNull)
- lines : PurchaseReturnLine[]

## model PurchaseReturnLine
- id : String   @id @default(cuid())
- purchaseReturnId : String   @map("purchase_return_id")
- purchaseOrderLineId : String   @map("purchase_order_line_id")
- inventoryItemId : String   @map("inventory_item_id")
- sku : String
- description : String
- quantity : Int
- unitCost : Decimal  @map("unit_cost") @db.Decimal(12, 2)
- createdAt : DateTime @default(now()) @map("created_at")
- purchaseReturn : PurchaseReturn    @relation(fields: [purchaseReturnId], references: [id], onDelete: Cascade)
- purchaseOrderLine : PurchaseOrderLine @relation(fields: [purchaseOrderLineId], references: [id], onDelete: Restrict)
- inventoryItem : InventoryItem     @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)

## model StockTransfer
- id : String              @id @default(cuid())
- tenantId : String              @map("tenant_id")
- fromBranchId : String?             @map("from_branch_id")
- toBranchId : String?             @map("to_branch_id")
- reference : String
- fromBranch : String              @map("from_branch")
- toBranch : String              @map("to_branch")
- items : Int                 @default(0)
- status : StockTransferStatus @default(pending)
- dispatchedAt : DateTime?           @map("dispatched_at")
- receivedAt : DateTime?           @map("received_at")
- createdAt : DateTime            @default(now()) @map("created_at")
- updatedAt : DateTime            @updatedAt @map("updated_at")
- tenant : Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- sourceBranch : Branch?             @relation("TransferFromBranch", fields: [fromBranchId], references: [id], onDelete: SetNull)
- destinationBranch : Branch?             @relation("TransferToBranch", fields: [toBranchId], references: [id], onDelete: SetNull)
- lineItems : StockTransferLine[]

## model StockTransferLine
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- stockTransferId : String   @map("stock_transfer_id")
- sourceInventoryItemId : String   @map("source_inventory_item_id")
- destinationInventoryItemId : String?  @map("destination_inventory_item_id")
- sku : String
- description : String
- quantity : Int
- quantityReceived : Int      @default(0) @map("quantity_received")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- stockTransfer : StockTransfer  @relation(fields: [stockTransferId], references: [id], onDelete: Cascade)
- sourceInventoryItem : InventoryItem  @relation("TransferSourceItem", fields: [sourceInventoryItemId], references: [id], onDelete: Restrict)
- destinationInventoryItem : InventoryItem? @relation("TransferDestinationItem", fields: [destinationInventoryItemId], references: [id], onDelete: SetNull)

## enum StockTransferStatus
pending, inTransit, received

## model AmcContract
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- reference : String
- customerName : String    @map("customer_name")
- equipmentCount : Int       @default(0) @map("equipment_count")
- startDate : DateTime  @map("start_date")
- endDate : DateTime  @map("end_date")
- value : Decimal   @default(0) @db.Decimal(12, 2)
- visitsPerYear : Int       @default(0) @map("visits_per_year")
- visitsDone : Int       @default(0) @map("visits_done")
- status : AmcStatus @default(active)
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

## model Invoice
- id : String        @id @default(cuid())
- tenantId : String        @map("tenant_id")
- customerId : String?       @map("customer_id")
- serviceRequestId : String?       @map("service_request_id")
- estimateId : String?       @map("estimate_id")
- salesOrderId : String?       @map("sales_order_id")
- jobId : String?       @map("job_id")
- reference : String
- customerName : String        @map("customer_name")
- jobRef : String        @map("job_ref")
- amount : Decimal       @default(0) @db.Decimal(12, 2)
- tax : Decimal       @default(0) @db.Decimal(12, 2)
- total : Decimal       @default(0) @db.Decimal(12, 2)
- paidTotal : Decimal       @default(0) @map("paid_total") @db.Decimal(12, 2)
- balanceDue : Decimal       @default(0) @map("balance_due") @db.Decimal(12, 2)
- customerSummary : String?       @map("customer_summary") @db.VarChar(200)
- terms : String?       @db.Text
- currency : String        @default("INR")
- status : InvoiceStatus @default(draft)
- approvedAt : DateTime?     @map("approved_at")
- approvedBy : String?       @map("approved_by")
- sentAt : DateTime?     @map("sent_at")
- issuedAt : DateTime      @default(now()) @map("issued_at")
- dueAt : DateTime      @map("due_at")
- createdAt : DateTime      @default(now()) @map("created_at")
- updatedAt : DateTime      @updatedAt @map("updated_at")
- tenant : Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- customer : Customer?         @relation(fields: [customerId], references: [id], onDelete: SetNull)
- serviceRequest : ServiceRequest?   @relation(fields: [serviceRequestId], references: [id], onDelete: SetNull)
- estimate : Estimate?         @relation(fields: [estimateId], references: [id], onDelete: SetNull)
- salesOrder : SalesOrder?       @relation(fields: [salesOrderId], references: [id], onDelete: SetNull)
- job : ServiceJob?       @relation(fields: [jobId], references: [id], onDelete: SetNull)
- lineItems : InvoiceLineItem[]
- payments : InvoicePayment[]
- documents : Document[]
- commissions : Commission[]

## model InvoiceLineItem
- id : String   @id @default(cuid())
- invoiceId : String   @map("invoice_id")
- estimateLineItemId : String?  @map("estimate_line_item_id")
- jobExtraId : String?  @map("job_extra_id")
- catalogItemId : String?  @map("catalog_item_id")
- type : String
- description : String
- quantity : Decimal  @default(1) @db.Decimal(12, 3)
- unitPrice : Decimal  @map("unit_price") @db.Decimal(12, 2)
- taxRate : Decimal  @default(0) @map("tax_rate") @db.Decimal(5, 2)
- discount : Decimal  @default(0) @db.Decimal(12, 2)
- lineTotal : Decimal  @map("line_total") @db.Decimal(12, 2)
- createdAt : DateTime @default(now()) @map("created_at")
- invoice : Invoice             @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
- estimateLineItem : EstimateLineItem?   @relation(fields: [estimateLineItemId], references: [id], onDelete: SetNull)
- jobExtra : JobExtra?           @relation(fields: [jobExtraId], references: [id], onDelete: SetNull)
- catalogItem : ServiceCatalogItem? @relation(fields: [catalogItemId], references: [id], onDelete: SetNull)

## model InvoicePayment
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- invoiceId : String   @map("invoice_id")
- amount : Decimal  @db.Decimal(12, 2)
- method : String
- reference : String?
- note : String?
- paidAt : DateTime @default(now()) @map("paid_at")
- recordedBy : String   @map("recorded_by")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- invoice : Invoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict)

## model StoredFile
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- storageKey : String   @unique @map("storage_key")
- originalName : String   @map("original_name")
- mimeType : String   @map("mime_type")
- size : Int
- sha256 : String
- uploadedById : String   @map("uploaded_by_id")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- uploadedBy : User                   @relation("FileUploader", fields: [uploadedById], references: [id], onDelete: Restrict)
- tenantLogoSettings : TenantSettings?        @relation("TenantLogo")
- inspectionAttachments : InspectionAttachment[]
- jobPhotos : JobPhoto[]             @relation("JobPhotoFile")
- jobSignatures : JobSignature[]         @relation("JobSignatureFile")
- documents : Document[]
- expenseReceipts : ProjectExpense[]       @relation("ExpenseReceipt")
- inventoryItemImages : InventoryItemImage[]   @relation("InventoryItemImageFile")

## model Document
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- fileId : String   @map("file_id")
- invoiceId : String?  @map("invoice_id")
- entityType : String   @map("entity_type")
- entityId : String   @map("entity_id")
- kind : String
- version : Int      @default(1)
- isInternal : Boolean  @default(false) @map("is_internal")
- createdBy : String   @map("created_by")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- file : StoredFile @relation(fields: [fileId], references: [id], onDelete: Restrict)
- invoice : Invoice?   @relation(fields: [invoiceId], references: [id], onDelete: SetNull)

## model QrScan
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- equipmentId : String?  @map("equipment_id")
- assetTag : String   @map("asset_tag")
- scannedById : String?  @map("scanned_by_id")
- source : String   @default("manual")
- ip : String?
- userAgent : String?  @map("user_agent")
- scannedAt : DateTime @default(now()) @map("scanned_at")
- tenant : Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- equipment : Equipment? @relation(fields: [equipmentId], references: [id], onDelete: SetNull)
- scannedBy : User?      @relation(fields: [scannedById], references: [id], onDelete: SetNull)

## model OfficeAsset
- id : String       @id @default(cuid())
- tenantId : String       @map("tenant_id")
- branchId : String?      @map("branch_id")
- assetTag : String       @map("asset_tag")
- name : String
- category : String
- serialNumber : String?      @map("serial_number")
- purchaseDate : DateTime?    @map("purchase_date")
- purchaseCost : Decimal      @default(0) @map("purchase_cost") @db.Decimal(12, 2)
- salvageValue : Decimal      @default(0) @map("salvage_value") @db.Decimal(12, 2)
- usefulLifeMonths : Int?     @map("useful_life_months")
- depreciationMethod : String @default("straight-line") @map("depreciation_method")
- status : EntityStatus @default(active)
- assignedTo : String?      @map("assigned_to")
- location : String?
- warrantyEnd : DateTime?    @map("warranty_end")
- lastMaintenanceAt : DateTime? @map("last_maintenance_at")
- nextMaintenanceAt : DateTime? @map("next_maintenance_at")
- disposedAt : DateTime?    @map("disposed_at")
- notes : String?
- createdAt : DateTime     @default(now()) @map("created_at")
- updatedAt : DateTime     @updatedAt @map("updated_at")
- tenant : Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- branch : Branch? @relation(fields: [branchId], references: [id], onDelete: SetNull)
- maintenance : OfficeAssetMaintenance[]

## model OfficeAssetMaintenance
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- officeAssetId : String   @map("office_asset_id")
- performedAt : DateTime @map("performed_at")
- nextMaintenanceAt : DateTime? @map("next_maintenance_at")
- provider : String?
- description : String   @db.Text
- cost : Decimal  @default(0) @db.Decimal(12, 2)
- createdBy : String   @map("created_by")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- officeAsset : OfficeAsset @relation(fields: [officeAssetId], references: [id], onDelete: Cascade)

## model ProjectExpense
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- branchId : String?  @map("branch_id")
- projectRef : String?  @map("project_ref")
- jobId : String?  @map("job_id")
- category : String
- description : String
- amount : Decimal  @db.Decimal(12, 2)
- incurredAt : DateTime @map("incurred_at")
- vendor : String?
- receiptFileId : String?  @map("receipt_file_id")
- createdBy : String   @map("created_by")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- branch : Branch?     @relation(fields: [branchId], references: [id], onDelete: SetNull)
- job : ServiceJob? @relation(fields: [jobId], references: [id], onDelete: SetNull)
- receiptFile : StoredFile? @relation("ExpenseReceipt", fields: [receiptFileId], references: [id], onDelete: SetNull)

## model Referral
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- customerId : String?  @map("customer_id")
- serviceRequestId : String? @map("service_request_id")
- referrerName : String   @map("referrer_name")
- referrerType : String   @map("referrer_type")
- source : String?
- status : String   @default("pending")
- createdAt : DateTime @default(now()) @map("created_at")
- tenant : Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- customer : Customer?    @relation(fields: [customerId], references: [id], onDelete: SetNull)
- serviceRequest : ServiceRequest? @relation(fields: [serviceRequestId], references: [id], onDelete: SetNull)
- commissions : Commission[]

## model Commission
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- referralId : String?   @map("referral_id")
- invoiceId : String?   @map("invoice_id")
- salesOrderId : String?   @map("sales_order_id")
- payeeName : String    @map("payee_name")
- basisAmount : Decimal   @map("basis_amount") @db.Decimal(12, 2)
- rate : Decimal   @default(0) @db.Decimal(5, 2)
- amount : Decimal   @db.Decimal(12, 2)
- status : String    @default("accrued")
- paidAt : DateTime? @map("paid_at")
- createdAt : DateTime  @default(now()) @map("created_at")
- tenant : Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- referral : Referral? @relation(fields: [referralId], references: [id], onDelete: SetNull)
- invoice : Invoice?    @relation(fields: [invoiceId], references: [id], onDelete: SetNull)
- salesOrder : SalesOrder? @relation(fields: [salesOrderId], references: [id], onDelete: SetNull)

## enum InvoiceStatus
draft, pendingApproval, approved, sent, paid, overdue, closed

## model Notification
- id : String           @id @default(cuid())
- tenantId : String           @map("tenant_id")
- recipientUserId : String?          @map("recipient_user_id")
- recipientRole : String?          @map("recipient_role")
- type : NotificationType
- title : String
- body : String
- read : Boolean          @default(false)
- deliveryStatus : String           @default("delivered") @map("delivery_status")
- createdAt : DateTime         @default(now()) @map("created_at")
- updatedAt : DateTime         @updatedAt @map("updated_at")
- tenant : Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- reads : NotificationRead[]

## model NotificationRead
- id : String   @id @default(cuid())
- notificationId : String   @map("notification_id")
- userId : String   @map("user_id")
- readAt : DateTime @default(now()) @map("read_at")
- notification : Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)

## enum NotificationType
amc, stock, approval, job, system

## model AuditLog
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- actor : String
- role : String
- action : String
- entity : String
- ip : String
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

## model SalesEnquiry
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- reference : String
- customerName : String    @map("customer_name")
- contactPerson : String    @map("contact_person")
- phone : String    @default("")
- email : String    @default("")
- productInterest : String    @map("product_interest") @db.Text
- interestLines : Json      @default("[]") @map("interest_lines")
- quantity : Decimal   @default(1) @db.Decimal(12, 3)
- estimatedBudget : Decimal?  @map("estimated_budget") @db.Decimal(12, 2)
- source : String    @default("")
- priority : String    @default("medium")
- status : String    @default("open")
- notes : String?   @db.Text
- assignedTo : String?   @map("assigned_to")
- createdBy : String?   @map("created_by")
- followUpDate : DateTime? @map("follow_up_date")
- convertedEstimateId : String?   @map("converted_estimate_id")
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

## model SupplierRFQ
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- reference : String
- supplierId : String?   @map("supplier_id")
- supplierName : String    @map("supplier_name")
- status : String    @default("draft")
- notes : String?   @db.Text
- dueDate : DateTime? @map("due_date")
- currency : String?   @default("INR") @db.VarChar(10)
- warranty : String?   @db.VarChar(500)
- incoterm : String?   @db.VarChar(100)
- shippingTerms : String?   @map("shipping_terms") @db.VarChar(500)
- paymentTerms : String?   @map("payment_terms") @db.VarChar(500)
- countryOfOrigin : String?   @map("country_of_origin") @db.VarChar(100)
- validUntil : DateTime? @map("valid_until")
- lines : Json      @default("[]")
- createdBy : String    @map("created_by")
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- supplierRecord : Supplier?       @relation(fields: [supplierId], references: [id], onDelete: SetNull)
- quotes : SupplierQuote[]

## model SupplierQuote
- id : String    @id @default(cuid())
- tenantId : String    @map("tenant_id")
- rfqId : String    @map("rfq_id")
- lines : Json      @default("[]")
- currency : String    @default("INR")
- warranty : String?
- incoterm : String?
- shippingTerms : String?   @map("shipping_terms")
- paymentTerms : String?   @map("payment_terms")
- countryOfOrigin : String?   @map("country_of_origin")
- validUntil : DateTime? @map("valid_until")
- notes : String?   @db.Text
- createdAt : DateTime  @default(now()) @map("created_at")
- updatedAt : DateTime  @updatedAt @map("updated_at")
- tenant : Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
- rfq : SupplierRFQ @relation(fields: [rfqId], references: [id], onDelete: Cascade)

## model WarrantyClaim
- id : String   @id @default(cuid())
- tenantId : String   @map("tenant_id")
- reference : String
- equipmentId : String   @map("equipment_id")
- equipmentName : String   @map("equipment_name")
- customerId : String?  @map("customer_id")
- customerName : String   @map("customer_name")
- serviceRequestId : String?  @map("service_request_id")
- originalJobId : String?  @map("original_job_id")
- underWarranty : Boolean  @default(false) @map("under_warranty")
- isPhysicalDamage : Boolean  @default(false) @map("is_physical_damage")
- componentCovered : Boolean  @default(false) @map("component_covered")
- claimDecision : String?  @map("claim_decision")
- inspectorNotes : String?  @map("inspector_notes") @db.Text
- decisionNotes : String?  @map("decision_notes") @db.Text
- status : String   @default("pending")
- createdBy : String   @map("created_by")
- createdAt : DateTime @default(now()) @map("created_at")
- updatedAt : DateTime @updatedAt @map("updated_at")
- tenant : Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
