// =====================================================================
// Catálogo de categorías y la línea del formulario donde va cada una.
// Lo usan el navegador (reportes) y las funciones de Netlify (IA).
// IMPORTANTE: los números de línea cambian a veces entre años fiscales;
// verifícalos con el formulario del año antes de entregar al CPA.
// =====================================================================

export const FORMS = {
  schedule_c: { short: 'Schedule C', label: 'Schedule C (1040) – Dueño único / LLC de un miembro', ownerLabel: 'Retiros/aportes del dueño (personal)' },
  '1120s':    { short: '1120-S',     label: 'Form 1120-S – S Corporation',                        ownerLabel: 'Distribuciones/aportes de accionistas' },
  '1065':     { short: '1065',       label: 'Form 1065 – Partnership / LLC de varios socios',     ownerLabel: 'Distribuciones/aportes de socios' },
  '1120':     { short: '1120',       label: 'Form 1120 – C Corporation',                          ownerLabel: 'Dividendos/aportes de accionistas' },
};

// group: income | cogs | expense | nontax
export const CATEGORIES = [
  { code: 'INC_SALES',      group: 'income',  label: 'Ingresos por ventas o servicios',            hint: 'Payments from customers, brokers, shippers, factoring company advances, card processor deposits (Stripe, Square)' },
  { code: 'INC_RETURNS',    group: 'income',  label: 'Devoluciones y descuentos a clientes',       hint: 'Refunds or chargebacks given back to customers (money out that reduces sales)' },
  { code: 'INC_OTHER',      group: 'income',  label: 'Otros ingresos',                             hint: 'Bank interest earned, cashback rewards, other non-sales business income' },
  { code: 'COGS_PURCH',     group: 'cogs',    label: 'Compras de mercancía / costo de ventas',     hint: 'Inventory or materials bought for resale or to make products (not used by trucking/service businesses)' },
  { code: 'FUEL',           group: 'expense', label: 'Combustible',                                hint: "Diesel, gas, DEF at truck stops/gas stations (Pilot, Flying J, Love's, TA, Petro, Shell, Chevron, fuel cards Comdata/EFS/WEX)" },
  { code: 'REPAIRS',        group: 'expense', label: 'Reparaciones y mantenimiento',               hint: 'Truck/trailer/vehicle repairs, tires, oil changes, truck wash, parts stores, mechanic shops, building repairs' },
  { code: 'TOLLS',          group: 'expense', label: 'Peajes, básculas y parqueo',                 hint: 'Tolls (SunPass, E-ZPass, PrePass, Bestpass), scales, truck parking, lumper fees' },
  { code: 'INSURANCE',      group: 'expense', label: 'Seguros del negocio (no salud)',             hint: 'Commercial auto, cargo, general liability, workers comp, occupational accident, business property insurance' },
  { code: 'TAXES_LICENSES', group: 'expense', label: 'Impuestos y licencias del negocio',          hint: 'IRP plates, IFTA payments, HVUT Form 2290, permits, UCR, business licenses, employer payroll taxes (941), sales tax paid. NOT income tax' },
  { code: 'COMMISSIONS',    group: 'expense', label: 'Comisiones y fees',                          hint: 'Dispatch fees, factoring fees, load board/broker fees, merchant processing fees, sales commissions' },
  { code: 'CONTRACT',       group: 'expense', label: 'Contratistas (1099)',                        hint: 'Payments to independent contractors or drivers paid as 1099 (not employees)' },
  { code: 'WAGES',          group: 'expense', label: 'Salarios de empleados (W-2)',                hint: 'Payroll net pay to employees, payroll services (ADP, Gusto, Paychex)' },
  { code: 'OFFICER_COMP',   group: 'expense', label: 'Salario de oficiales/accionistas',           hint: 'Payroll paid to corporate officers or shareholders' },
  { code: 'GUARANTEED',     group: 'expense', label: 'Pagos garantizados a socios',                hint: 'Fixed payments to partners for their services' },
  { code: 'BENEFITS',       group: 'expense', label: 'Beneficios de empleados',                    hint: 'Employee health insurance and other employee benefit programs' },
  { code: 'RETIREMENT',     group: 'expense', label: 'Planes de retiro',                           hint: '401k, SEP or SIMPLE contributions' },
  { code: 'INTEREST',       group: 'expense', label: 'Intereses de préstamos del negocio',         hint: 'Interest portion of truck/equipment loans, business credit card interest, line of credit interest' },
  { code: 'EQUIPMENT',      group: 'expense', label: 'Compra de equipo o vehículos (depreciación)', hint: 'Buying trucks, trailers, vehicles, computers or equipment over ~$2,500 (the CPA decides depreciation)' },
  { code: 'RENT_EQUIP',     group: 'expense', label: 'Renta/leasing de vehículos y equipo',        hint: 'Truck, trailer or vehicle lease payments, equipment rental' },
  { code: 'RENT_PROPERTY',  group: 'expense', label: 'Renta de local o yarda',                     hint: 'Office rent, yard or parking lot rent, storage units' },
  { code: 'LEGAL_PROF',     group: 'expense', label: 'Servicios legales y profesionales',          hint: 'Accountants, CPA, tax preparers, lawyers, compliance services, consultants' },
  { code: 'OFFICE',         group: 'expense', label: 'Gastos de oficina',                          hint: 'Postage, printing, office supplies, small office items' },
  { code: 'SUPPLIES',       group: 'expense', label: 'Suministros y herramientas',                 hint: 'Straps, chains, tarps, tools, small equipment, cleaning and work supplies' },
  { code: 'SOFTWARE',       group: 'expense', label: 'Software y suscripciones',                   hint: 'ELD, TMS, load boards (DAT, Truckstop), Google Workspace, QuickBooks, business apps' },
  { code: 'UTILITIES',      group: 'expense', label: 'Teléfono, internet y servicios',             hint: 'Cell phone, internet, electricity/water for the business location' },
  { code: 'ADVERTISING',    group: 'expense', label: 'Publicidad y mercadeo',                      hint: 'Ads (Facebook, Google), website, business cards, marketing' },
  { code: 'TRAVEL',         group: 'expense', label: 'Viajes de negocio',                          hint: 'Hotels, flights, rental cars while traveling for business' },
  { code: 'MEALS',          group: 'expense', label: 'Comidas de negocio (50%)',                   hint: 'Restaurant/fast food meals while traveling or with clients', deductPct: 0.5 },
  { code: 'BANK_FEES',      group: 'expense', label: 'Comisiones bancarias',                       hint: 'Monthly service fees, wire fees, overdraft/NSF fees, ATM fees' },
  { code: 'OTHER_EXP',      group: 'expense', label: 'Otros gastos del negocio',                   hint: 'Business expenses that fit nowhere else (drug tests, training, uniforms, dues, subscriptions to associations)' },
  { code: 'TRANSFER',       group: 'nontax',  label: 'Transferencia entre cuentas propias',        hint: "Transfers between the business's own accounts, credit card payments made from checking, savings transfers" },
  { code: 'OWNER',          group: 'nontax',  label: 'Retiros/aportes del dueño (personal)',       hint: 'Personal expenses paid with business money, owner draws or distributions, money the owner puts into the business' },
  { code: 'LOAN',           group: 'nontax',  label: 'Préstamos (principal)',                      hint: 'Loan proceeds received, or principal portion of loan payments' },
  { code: 'INCOME_TAX',     group: 'nontax',  label: 'Pago de impuestos sobre la renta',           hint: 'IRS or state income tax payments, estimated taxes (1040-ES). Not payroll taxes' },
];

const L = (order, label) => ({ order, label });
const NOT_APPLICABLE = null;

// Línea de "otros gastos / otras deducciones" de cada formulario
const OTHER = {
  schedule_c: L(27, 'Línea 27a – Otros gastos'),
  '1120s':    L(20, 'Otras deducciones (adjuntar detalle)'),
  '1065':     L(21, 'Otras deducciones (adjuntar detalle)'),
  '1120':     L(26, 'Otras deducciones (adjuntar detalle)'),
};

// Mapeo categoría → línea. Si un gasto no aparece aquí, va a OTHER.
const LINES = {
  schedule_c: {
    INC_SALES: L(1, 'Línea 1 – Ingresos brutos'),
    INC_RETURNS: L(2, 'Línea 2 – Devoluciones y descuentos'),
    INC_OTHER: L(6, 'Línea 6 – Otros ingresos'),
    COGS_PURCH: L(4, 'Línea 4 / Parte III – Costo de ventas'),
    ADVERTISING: L(8, 'Línea 8 – Publicidad'),
    FUEL: L(9, 'Línea 9 – Gastos de vehículos y camiones'),
    TOLLS: L(9, 'Línea 9 – Gastos de vehículos y camiones'),
    COMMISSIONS: L(10, 'Línea 10 – Comisiones y fees'),
    CONTRACT: L(11, 'Línea 11 – Contract labor'),
    EQUIPMENT: L(13, 'Línea 13 – Depreciación / Sección 179 (Form 4562)'),
    BENEFITS: L(14, 'Línea 14 – Beneficios de empleados'),
    INSURANCE: L(15, 'Línea 15 – Seguros (no salud)'),
    INTEREST: L(16, 'Línea 16b – Intereses (otros)'),
    LEGAL_PROF: L(17, 'Línea 17 – Servicios legales y profesionales'),
    OFFICE: L(18, 'Línea 18 – Gastos de oficina'),
    RETIREMENT: L(19, 'Línea 19 – Planes de pensión'),
    RENT_EQUIP: L(20, 'Línea 20a – Renta de vehículos, maquinaria y equipo'),
    RENT_PROPERTY: L(20.5, 'Línea 20b – Renta de otra propiedad'),
    REPAIRS: L(21, 'Línea 21 – Reparaciones y mantenimiento'),
    SUPPLIES: L(22, 'Línea 22 – Suministros'),
    TAXES_LICENSES: L(23, 'Línea 23 – Impuestos y licencias'),
    TRAVEL: L(24, 'Línea 24a – Viajes'),
    MEALS: L(24.5, 'Línea 24b – Comidas (50% deducible)'),
    UTILITIES: L(25, 'Línea 25 – Servicios (utilities)'),
    WAGES: L(26, 'Línea 26 – Salarios'),
    OFFICER_COMP: NOT_APPLICABLE,
    GUARANTEED: NOT_APPLICABLE,
  },
  '1120s': {
    INC_SALES: L(1, 'Línea 1a – Ingresos brutos'),
    INC_RETURNS: L(1.5, 'Línea 1b – Devoluciones y descuentos'),
    INC_OTHER: L(5, 'Línea 5 – Otros ingresos'),
    COGS_PURCH: L(2, 'Línea 2 – Costo de ventas (Form 1125-A)'),
    OFFICER_COMP: L(7, 'Línea 7 – Compensación de oficiales'),
    WAGES: L(8, 'Línea 8 – Salarios'),
    REPAIRS: L(9, 'Línea 9 – Reparaciones y mantenimiento'),
    RENT_EQUIP: L(11, 'Línea 11 – Rentas'),
    RENT_PROPERTY: L(11, 'Línea 11 – Rentas'),
    TAXES_LICENSES: L(12, 'Línea 12 – Impuestos y licencias'),
    INTEREST: L(13, 'Línea 13 – Intereses'),
    EQUIPMENT: L(14, 'Línea 14 – Depreciación (Form 4562)'),
    ADVERTISING: L(16, 'Línea 16 – Publicidad'),
    RETIREMENT: L(17, 'Línea 17 – Planes de pensión'),
    BENEFITS: L(18, 'Línea 18 – Beneficios de empleados'),
    GUARANTEED: NOT_APPLICABLE,
  },
  '1065': {
    INC_SALES: L(1, 'Línea 1a – Ingresos brutos'),
    INC_RETURNS: L(1.5, 'Línea 1b – Devoluciones y descuentos'),
    INC_OTHER: L(7, 'Línea 7 – Otros ingresos'),
    COGS_PURCH: L(2, 'Línea 2 – Costo de ventas (Form 1125-A)'),
    WAGES: L(9, 'Línea 9 – Salarios'),
    GUARANTEED: L(10, 'Línea 10 – Pagos garantizados a socios'),
    REPAIRS: L(11, 'Línea 11 – Reparaciones y mantenimiento'),
    RENT_EQUIP: L(13, 'Línea 13 – Renta'),
    RENT_PROPERTY: L(13, 'Línea 13 – Renta'),
    TAXES_LICENSES: L(14, 'Línea 14 – Impuestos y licencias'),
    INTEREST: L(15, 'Línea 15 – Intereses'),
    EQUIPMENT: L(16, 'Línea 16a – Depreciación (Form 4562)'),
    RETIREMENT: L(18, 'Línea 18 – Planes de retiro'),
    BENEFITS: L(19, 'Línea 19 – Beneficios de empleados'),
    OFFICER_COMP: NOT_APPLICABLE,
  },
  '1120': {
    INC_SALES: L(1, 'Línea 1a – Ingresos brutos'),
    INC_RETURNS: L(1.5, 'Línea 1b – Devoluciones y descuentos'),
    INC_OTHER: L(10, 'Línea 10 – Otros ingresos'),
    COGS_PURCH: L(2, 'Línea 2 – Costo de ventas (Form 1125-A)'),
    OFFICER_COMP: L(12, 'Línea 12 – Compensación de oficiales'),
    WAGES: L(13, 'Línea 13 – Salarios'),
    REPAIRS: L(14, 'Línea 14 – Reparaciones y mantenimiento'),
    RENT_EQUIP: L(16, 'Línea 16 – Rentas'),
    RENT_PROPERTY: L(16, 'Línea 16 – Rentas'),
    TAXES_LICENSES: L(17, 'Línea 17 – Impuestos y licencias'),
    INTEREST: L(18, 'Línea 18 – Intereses'),
    EQUIPMENT: L(20, 'Línea 20 – Depreciación (Form 4562)'),
    ADVERTISING: L(22, 'Línea 22 – Publicidad'),
    RETIREMENT: L(23, 'Línea 23 – Planes de pensión'),
    BENEFITS: L(24, 'Línea 24 – Beneficios de empleados'),
    GUARANTEED: NOT_APPLICABLE,
  },
};

const BY_CODE = new Map(CATEGORIES.map(c => [c.code, c]));
export const catByCode = code => BY_CODE.get(code) || null;
export const formOf = form => (FORMS[form] ? form : 'schedule_c');

/** Línea del formulario para una categoría. null = no aplica a ese formulario. */
export function lineFor(form, code) {
  form = formOf(form);
  const cat = catByCode(code);
  if (!cat) return null;
  if (cat.group === 'nontax') return L(999, 'No va al tax return');
  const map = LINES[form];
  if (code in map) return map[code];           // puede ser null (no aplica)
  if (cat.group === 'expense') return OTHER[form];
  return null;
}

/** Categorías disponibles para un formulario. */
export function categoriesFor(form) {
  return CATEGORIES.filter(c => lineFor(form, c.code) !== null);
}

/** Nombre visible de la categoría (el de dueño cambia según el formulario). */
export function catLabel(code, form) {
  if (code === 'OWNER') return FORMS[formOf(form)].ownerLabel;
  return catByCode(code)?.label || code || '';
}
