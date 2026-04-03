/**
 * Coerces input into a finite number; returns 0 when parsing fails.
 */
function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Sums an array of numeric-like values using safe coercion.
 */
function sum(values) {
  return values.reduce((total, value) => total + asNumber(value), 0);
}

/**
 * Builds lookup maps for setup-table rates used during quote calculations.
 */
function rateMaps(setup) {
  return {
    manufacturerRates: Object.fromEntries(
      (setup?.materialManufacturer || []).map((item) => [item.name, asNumber(item.rate)])
    ),
    leafGuardRates: Object.fromEntries(
      (setup?.leafGuard || []).map((item) => [item.name, asNumber(item.price)])
    ),
    tripFeeRates: Object.fromEntries(
      (setup?.tripFeeRates || []).map((item) => [item.trip, asNumber(item.rate)])
    ),
  };
}

/**
 * Calculates gutter quantity from side count and run length.
 * Formula: (sides * length) + 1.
 */
export function computeGutterQty(sides, length) {
  const sidesNum = asNumber(sides);
  const lengthNum = asNumber(length);
  if (sidesNum <= 0 || lengthNum <= 0) return 0;
  return sidesNum * lengthNum + 1;
}

/**
 * Calculates downspout footage per section.
 * Formula: (height + 1.25) * downspout quantity.
 */
export function computeDownspoutFootage(height, downspoutQty) {
  const heightNum = asNumber(height);
  const qtyNum = asNumber(downspoutQty);
  if (heightNum <= 0 || qtyNum <= 0) return 0;
  return (heightNum + 1.25) * qtyNum;
}

/**
 * Derives top and bottom end-cap totals from up to 4 section side values.
 */
export function deriveEndCapsFromSections(sections) {
  const safeSections = Array.isArray(sections) ? sections : [];
  const side1 = asNumber(safeSections[0]?.sides);
  const side2 = asNumber(safeSections[1]?.sides);
  const side3 = asNumber(safeSections[2]?.sides);
  const side4 = asNumber(safeSections[3]?.sides);
  return {
    topPair: side1 + side2,
    bottomPair: side3 + side4,
  };
}

/**
 * Produces lightweight preview data for gutter lengths and end-cap counts.
 */
export function calculateGutterPreview(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const displayLengths = safeRows.map((row) => asNumber(row?.length));
  const endCaps = deriveEndCapsFromSections(
    safeRows.map((row) => ({ sides: asNumber(row?.side) }))
  );
  return { displayLengths, endCaps };
}

/**
 * Computes the full quote payload from project values and setup tables.
 * Manual manufacturer/trip/leaf-guard rates override setup rates only when enabled and non-blank.
 */
export function calculateQuote(project, setup) {
  if (!project?.projectId) {
    return {
      gated: true,
      message: "Project selector is blank. Outputs are hidden until a project ID is set.",
    };
  }

  const rates = rateMaps(setup);

  // Manufacturer rate resolution
  const setupManufacturerRate = rates.manufacturerRates[project.manufacturer] ?? 0;
  const manualManufacturerRateEnabled = Boolean(project?.manualManufacturerRateEnabled);
  const hasManualManufacturerRate =
    project?.manualManufacturerRate !== undefined &&
    project?.manualManufacturerRate !== null &&
    String(project.manualManufacturerRate).trim() !== "";
  const manualManufacturerRate = hasManualManufacturerRate ? asNumber(project.manualManufacturerRate) : null;
  const manufacturerRate =
    manualManufacturerRateEnabled && manualManufacturerRate !== null
      ? manualManufacturerRate
      : setupManufacturerRate;

  // Leaf guard rate resolution
  const setupLeafGuardUnitPrice = rates.leafGuardRates[project.leafGuard] ?? 0;
  const manualLeafGuardRateEnabled = Boolean(project?.manualLeafGuardRateEnabled);
  const hasManualLeafGuardRate =
    project?.manualLeafGuardRate !== undefined &&
    project?.manualLeafGuardRate !== null &&
    String(project.manualLeafGuardRate).trim() !== "";
  const manualLeafGuardRate = hasManualLeafGuardRate ? asNumber(project.manualLeafGuardRate) : null;
  const leafGuardUnitPrice =
    manualLeafGuardRateEnabled && manualLeafGuardRate !== null
      ? manualLeafGuardRate
      : setupLeafGuardUnitPrice;

  // Trip fee rate resolution
  const setupTripFeeRate = rates.tripFeeRates[project.tripFeeKey] ?? 0;
  const manualTripRateEnabled = Boolean(project?.manualTripRateEnabled);
  const hasManualTripRate =
    project?.manualTripRate !== undefined &&
    project?.manualTripRate !== null &&
    String(project.manualTripRate).trim() !== "";
  const manualTripRate = hasManualTripRate ? asNumber(project.manualTripRate) : null;
  const tripFeeLookup =
    manualTripRateEnabled && manualTripRate !== null
      ? manualTripRate
      : setupTripFeeRate;

  const downspoutUnitPrice = asNumber(project.downspoutUnitPrice);
  const downspoutPipeLength = asNumber(project.downspoutPipeLength);
  const hangerRate = asNumber(project.hangerRate);
  const tripHours = asNumber(project.tripHours);
  const tripHourlyRate = asNumber(project.tripHourlyRate);

  const totalEndCaps =
    asNumber(project.rightEndCaps1) +
    asNumber(project.rightEndCaps2) +
    asNumber(project.leftEndCaps1) +
    asNumber(project.leftEndCaps2);
  const derivedEndCaps = deriveEndCapsFromSections(project.sections);
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
  const sectionDownspoutPrices = downspoutFootages.map((qty) => asNumber(qty) * manufacturerRate);
  const downspoutPieces =
    downspoutPipeLength > 0 ? Math.ceil(totalDownspouts / downspoutPipeLength) : 0;
  const downspoutCostByPiece = downspoutPieces * downspoutUnitPrice;
  const downspoutCost = sum(sectionDownspoutPrices);
  const hangerCost = totalGutter * hangerRate;
  const leafGuardCost = totalGutter * leafGuardUnitPrice;
  const extrasPrice = sum(
    (project.extras || []).map((item) => asNumber(item.qty) * asNumber(item.unitPrice))
  );
  const discountPercent = asNumber(project.discountPercent);

  const salesPriceForProject =
    (totalGutter + totalDownspouts) * manufacturerRate + tripFeePrice + extrasPrice;

  const subtotal = salesPriceForProject;
  const discountAmount = subtotal * discountPercent;
  const discountedTotal = subtotal - discountAmount;

  return {
    gated: false,
    pricing: {
      manufacturerRate,
      setupManufacturerRate,
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
      manualLeafGuardRateEnabled,
      manualLeafGuardRate,
      leafGuardUnitPrice,
      leafGuardCost,
      tripHours,
      tripHourlyRate,
      setupTripFeeRate,
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
      discountPercent,
      discountAmount,
      discountedTotal,
      gutterQuantities,
      downspoutFootages,
      sectionGutterPrices,
      sectionDownspoutPrices,
    },
  };
}
