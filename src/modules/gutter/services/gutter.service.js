/**
 * Coerces input into a finite number; returns 0 when parsing fails.
 */
function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Explicit allowances keep units clear and prevent magic numbers in formulas.
const CONST_GUTTER_EXTRA = 1;
const CONST_DOWNSPOUT_EXTRA_HEIGHT = 1.25;
const CONST_MIN_SIDE_COUNT = 1;
const CONST_MAX_SIDE_COUNT = 10;
const CONST_MIN_DOWNSPOUT_QTY = 1;
const CONST_MAX_DOWNSPOUT_QTY = 10;

/**
 * Clamps a numeric value into a given inclusive range.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Determines whether a value is present (not null/undefined/blank string).
 */
function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/**
 * Sums an array of numeric-like values using safe coercion.
 */
function sum(values) {
  return values.reduce((total, value) => total + asNumber(value), 0);
}

/**
 * Normalizes a percent-like input into a rate in [0, 1].
 * Supports either fractional input (0.2) or whole percent input (20).
 */
function normalizePercentRate(value) {
  if (!hasValue(value)) return 0;
  const numeric = asNumber(value);
  if (numeric <= 0) return 0;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return clamp(normalized, 0, 1);
}

/**
 * Centralizes derived money totals so financial outputs stay consistent.
 */
function computeFinancialSummary({ subtotal, discountRate, depositRate }) {
  const safeSubtotal = asNumber(subtotal);
  const safeDiscountRate = clamp(asNumber(discountRate), 0, 1);
  const safeDepositRate = clamp(asNumber(depositRate), 0, 1);

  const discountAmount = safeSubtotal * safeDiscountRate;
  const projectTotal = safeSubtotal - discountAmount;
  const depositAmount = projectTotal * safeDepositRate;
  const remainingBalance = projectTotal - depositAmount;

  return {
    projectTotal,
    discountedTotal: projectTotal,
    discountAmount,
    depositAmount,
    remainingBalance,
    balanceDue: remainingBalance,
    savingsAmount: discountAmount,
  };
}

/**
 * Builds lookup maps for setup-table rates used during quote calculations.
 */
function rateMaps(setup) {
  const addKey = (target, key, value) => {
    if (!hasValue(key)) return;
    target[String(key)] = asNumber(value);
  };

  const manufacturerRates = {};
  const leafGuardRates = {};
  const tripFeeRates = {};
  const discountRates = {};

  (setup?.materialManufacturer || []).forEach((item) => {
    addKey(manufacturerRates, item.id, item.rate);
    addKey(manufacturerRates, item.name, item.rate);
  });

  (setup?.leafGuard || []).forEach((item) => {
    addKey(leafGuardRates, item.id, item.price);
    addKey(leafGuardRates, item.name, item.price);
  });

  (setup?.tripRates || setup?.tripFeeRates || []).forEach((item) => {
    addKey(tripFeeRates, item.id, item.rate);
    addKey(tripFeeRates, item.trip, item.rate);
    addKey(tripFeeRates, item.label, item.rate);
  });

  (setup?.discounts || []).forEach((item) => {
    addKey(discountRates, item.id, item.percent);
  });

  return {
    manufacturerRates,
    leafGuardRates,
    tripFeeRates,
    discountRates,
  };
}

/**
 * Calculates gutter quantity from side count and run length.
 * Formula: (sides + length) + CONST_GUTTER_EXTRA.
 */
export function computeGutterQty(sides, length) {
  const segmentCountRaw = asNumber(sides);
  const runLength = asNumber(length);

  // Treat an unused side as zero only when both values are empty/zero.
  if (segmentCountRaw <= 0 && runLength <= 0) return 0;

  const segmentCount = clamp(
    segmentCountRaw,
    CONST_MIN_SIDE_COUNT,
    CONST_MAX_SIDE_COUNT
  );

  // Spec formula: gutter = (segments + length) + allowance.
  return segmentCount + runLength + CONST_GUTTER_EXTRA;
}

/**
 * Calculates downspout footage per section.
 * Formula: (height + CONST_DOWNSPOUT_EXTRA_HEIGHT) * downspout quantity.
 */
export function computeDownspoutFootage(height, downspoutQty) {
  const heightNum = asNumber(height);
  const qtyRaw = asNumber(downspoutQty);
  if (heightNum <= 0 && qtyRaw <= 0) return 0;
  if (heightNum <= 0) return 0;

  const qtyNum = clamp(
    qtyRaw,
    CONST_MIN_DOWNSPOUT_QTY,
    CONST_MAX_DOWNSPOUT_QTY
  );

  return (heightNum + CONST_DOWNSPOUT_EXTRA_HEIGHT) * qtyNum;
}

/**
 * Derives grouped end-cap totals from dynamic section side values.
 * Each group combines 2 consecutive sides: (1-2), (3-4), (5-6), etc.
 */
export function deriveEndCapsFromSections(sections) {
  const safeSections = Array.isArray(sections) ? sections : [];
  const sideValues = safeSections.map((section) => {
    const sideRaw = asNumber(section?.sides);
    const isUsedSide =
      sideRaw > 0 ||
      asNumber(section?.length) > 0 ||
      asNumber(section?.height) > 0 ||
      asNumber(section?.downspoutQty) > 0;

    if (!isUsedSide) return 0;

    return clamp(sideRaw, CONST_MIN_SIDE_COUNT, CONST_MAX_SIDE_COUNT);
  });
  const groups = [];

  for (let index = 0; index < sideValues.length; index += 2) {
    const fromSide = index + 1;
    const toSide = Math.min(index + 2, sideValues.length);
    const value = asNumber(sideValues[index]) + asNumber(sideValues[index + 1]);
    groups.push({
      index: Math.floor(index / 2) + 1,
      fromSide,
      toSide,
      value,
    });
  }

  const group1 = groups[0]?.value ?? 0;
  const group2 = groups[1]?.value ?? 0;
  const total = groups.reduce((acc, group) => acc + group.value * 2, 0);

  return {
    groups,
    group1,
    group2,
    rightEndCaps1: group1,
    leftEndCaps1: group1,
    rightEndCaps2: group2,
    leftEndCaps2: group2,
    total,
  };
}

/**
 * Produces lightweight preview data for gutter lengths and end-cap counts.
 */
export function calculateGutterPreview(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const displayLengths = safeRows.map((row) => asNumber(row?.length));
  const endCaps = deriveEndCapsFromSections(
    safeRows.map((row) => ({ sides: asNumber(row?.sides) }))
  );
  return { displayLengths, endCaps };
}

/**
 * Computes the full quote payload from project values and setup tables.
 * Manual manufacturer/trip/leaf-guard rates override setup rates only when enabled and non-blank.
 */
export function calculateQuote(project, setup) {
  const rates = rateMaps(setup);

  // Manufacturer rate resolution
  const manufacturerKey = project.manufacturerId ?? project.manufacturer;
  const setupManufacturerRate = rates.manufacturerRates[String(manufacturerKey)] ?? 0;
  const rawCustomManufacturerRate = project?.cstmManufacturerRate ?? project?.cstm_manufacturer_rate;
  const hasCustomManufacturerRate = hasValue(rawCustomManufacturerRate);
  const customManufacturerRate = hasCustomManufacturerRate ? asNumber(rawCustomManufacturerRate) : null;
  const manualManufacturerRateEnabled = Boolean(project?.manualManufacturerRateEnabled);
  const hasManualManufacturerRate = hasValue(project?.manualManufacturerRate);
  const manualManufacturerRate = hasManualManufacturerRate ? asNumber(project.manualManufacturerRate) : null;
  const manufacturerRate =
    customManufacturerRate ??
    (manualManufacturerRateEnabled && manualManufacturerRate !== null
      ? manualManufacturerRate
      : setupManufacturerRate);

  // Leaf guard rate resolution
  const leafGuardKey = project.leafGuardId ?? project.leafGuard;
  const setupLeafGuardUnitPrice = rates.leafGuardRates[String(leafGuardKey)] ?? 0;
  const rawCustomLeafGuardRate = project?.cstmLeafGuardPrice ?? project?.cstm_leaf_guard_price;
  const hasCustomLeafGuardRate = hasValue(rawCustomLeafGuardRate);
  const customLeafGuardRate = hasCustomLeafGuardRate ? asNumber(rawCustomLeafGuardRate) : null;
  const manualLeafGuardRateEnabled = Boolean(project?.manualLeafGuardRateEnabled);
  const hasManualLeafGuardRate = hasValue(project?.manualLeafGuardRate);
  const manualLeafGuardRate = hasManualLeafGuardRate ? asNumber(project.manualLeafGuardRate) : null;
  const leafGuardUnitPrice =
    customLeafGuardRate ??
    (manualLeafGuardRateEnabled && manualLeafGuardRate !== null
      ? manualLeafGuardRate
      : setupLeafGuardUnitPrice);

  // Trip fee rate resolution
  const tripKey = project.tripId ?? project.tripFeeKey;
  const setupTripFeeRate = rates.tripFeeRates[String(tripKey)] ?? 0;
  const rawCustomTripRate = project?.cstmTripRate ?? project?.cstm_trip_rate;
  const hasCustomTripRate = hasValue(rawCustomTripRate);
  const customTripRate = hasCustomTripRate ? asNumber(rawCustomTripRate) : null;
  const manualTripRateEnabled = Boolean(project?.manualTripRateEnabled);
  const hasManualTripRate = hasValue(project?.manualTripRate);
  const manualTripRate = hasManualTripRate ? asNumber(project.manualTripRate) : null;
  const tripFeeLookup =
    customTripRate ??
    (manualTripRateEnabled && manualTripRate !== null
      ? manualTripRate
      : setupTripFeeRate);

  const downspoutUnitPrice = asNumber(project.downspoutUnitPrice);
  const downspoutPipeLength = asNumber(project.downspoutPipeLength);
  const hangerRate = asNumber(project.hangerRate);
  const tripHours = asNumber(project.tripHours);
  const tripHourlyRate = asNumber(project.tripHourlyRate);

  const derivedEndCaps = deriveEndCapsFromSections(project.sections);
  const totalEndCaps = derivedEndCaps.total;
  const endCapUnitPrice = asNumber(project.endCapUnitPrice);
  const endCapCost = totalEndCaps * endCapUnitPrice;

  const tripFeePrice =
    tripHours > 0 && tripHourlyRate > 0
      ? tripHours * tripHourlyRate
      : tripFeeLookup;

  const gutterQuantities = (project.sections || []).map((section) =>
    computeGutterQty(section.sides, section.length)
  );

  const downspoutFootages = (project.sections || []).map((section) =>
    computeDownspoutFootage(section.height, section.downspoutQty)
  );

  const totalGutter = sum(gutterQuantities);
  const totalDownspouts = sum(downspoutFootages);

  const materialCost = totalGutter * manufacturerRate;
  const sectionGutterPrices = gutterQuantities.map((qty) => asNumber(qty) * manufacturerRate);

  // Downspouts can be sold by piece length or by direct unit price when no piece length is provided.
  const downspoutPieces =
    downspoutPipeLength > 0 ? Math.ceil(totalDownspouts / downspoutPipeLength) : 0;
  const downspoutCostByPiece = downspoutPieces * downspoutUnitPrice;
  const downspoutCost =
    downspoutPipeLength > 0
      ? downspoutCostByPiece
      : totalDownspouts * downspoutUnitPrice;
  const sectionDownspoutPrices = downspoutFootages.map((qty) =>
    totalDownspouts > 0 ? (asNumber(qty) / totalDownspouts) * downspoutCost : 0
  );

  const hangerCost = totalGutter * hangerRate;
  const shouldApplyLeafGuard = Boolean(
    project.leafGuardIncluded || hasValue(project.leafGuardId) || hasCustomLeafGuardRate
  );
  const leafGuardCost = shouldApplyLeafGuard ? totalGutter * leafGuardUnitPrice : 0;
  const extrasPrice = project.extrasIncluded
    ? sum((project.extras || []).map((item) => asNumber(item.qty) * asNumber(item.unitPrice)))
    : 0;
  const setupDiscountPercent = rates.discountRates[String(project.discountId)] ?? 0;
  const rawCustomDiscountPercent = project?.cstmDiscountPercentage ?? project?.cstm_discount_percentage;
  const hasCustomDiscountPercent = hasValue(rawCustomDiscountPercent);
  const customDiscountPercent = hasCustomDiscountPercent ? asNumber(rawCustomDiscountPercent) : null;
  const shouldApplyDiscount = Boolean(
    project.discountIncluded || hasValue(project.discountId) || hasCustomDiscountPercent
  );
  const rawDiscountPercent = shouldApplyDiscount
    ? customDiscountPercent ??
      (hasValue(project.discountPercent) ? asNumber(project.discountPercent) : setupDiscountPercent)
    : 0;
  const discountPercent = Math.min(1, Math.max(0, rawDiscountPercent));

  const subtotal =
    materialCost +
    downspoutCost +
    hangerCost +
    leafGuardCost +
    tripFeePrice +
    endCapCost +
    extrasPrice;

  const rawDepositPercent = project.depositPercent ?? project.deposit_percent;
  const depositRate = normalizePercentRate(rawDepositPercent);

  const {
    projectTotal,
    discountedTotal,
    discountAmount,
    depositAmount,
    remainingBalance,
    balanceDue,
    savingsAmount,
  } = computeFinancialSummary({
    subtotal,
    discountRate: discountPercent,
    depositRate,
  });

  const salesPriceForProject = projectTotal;

  return {
    gated: false,
    pricing: {
      manufacturerRate,
      setupManufacturerRate,
      customManufacturerRate,
      manualManufacturerRateEnabled,
      manualManufacturerRate,
      totalGutter,
      totalDownspouts,
      materialCost,
      downspoutCost,
      downspoutCostByPiece,
      downspoutPieces,
      hangerRate,
      hangerCost,
      setupLeafGuardUnitPrice,
      customLeafGuardRate,
      manualLeafGuardRateEnabled,
      manualLeafGuardRate,
      leafGuardUnitPrice,
      leafGuardCost,
      tripHours,
      tripHourlyRate,
      setupTripFeeRate,
      customTripRate,
      manualTripRateEnabled,
      manualTripRate,
      tripFeeLookup,
      tripFeePrice,
      totalEndCaps,
      derivedEndCaps,
      endCapUnitPrice,
      endCapCost,
      extrasPrice,
      salesPriceForProject,
      subtotal,
      setupDiscountPercent,
      customDiscountPercent,
      discountPercent,
      discountAmount,
      projectTotal,
      discountedTotal,
      depositRate,
      depositPercent: depositRate,
      depositPercentDisplay: depositRate * 100,
      depositAmount,
      remainingBalance,
      balanceDue,
      savingsAmount,
      gutterQuantities,
      downspoutFootages,
      sectionGutterPrices,
      sectionDownspoutPrices,
    },
  };
}
