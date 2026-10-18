// Shared helpers for the vehicle agreements (consignment + referral fee).
//
// Data shape stored per vehicle inside `vehicleAgreements[vehicleKey]`:
//   {
//     consignments: [ { id, stamp, status: 'sent' | 'signed', sentAt, ...formFields } ],
//     referral:     { stamp, amount, ...formFields }
//   }
// Older saves kept a single `consignment` object; getConsignments() upgrades it.

export const getConsignments = (data) => {
  if (!data) return [];
  if (Array.isArray(data.consignments)) return data.consignments;
  if (data.consignment) return [{ id: 'c_legacy', status: 'sent', ...data.consignment }];
  return [];
};

// Returns a copy of `data` with the consignment list replaced (and the legacy
// single `consignment` key removed).
export const withConsignments = (data, list) => {
  const { consignment, ...rest } = data || {};
  return { ...rest, consignments: list };
};

export const money = (n) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// The three "Dealer Compensation" choices for one consignment. Only options that
// have a value are returned; the one chosen in the form is marked `selected`.
export const compOptionsFor = (c) => {
  const all = [
    {
      key: 'min',
      value: parseFloat(c.minPrice) || 0,
      title: `Anything above ${money(c.minPrice)}`,
      note: `(Dealer keeps amount over ${money(c.minPrice)})`,
    },
    {
      key: 'flat',
      value: parseFloat(c.flatFee) || 0,
      title: `${money(c.flatFee)} Flat Fee`,
      note: `(Dealer keeps ${money(c.flatFee)})`,
    },
    {
      key: 'percent',
      value: parseFloat(c.commission) || 0,
      title: `${c.commission}% of Total Sale`,
      note: `(Dealer keeps ${c.commission}% of sale price)`,
    },
  ];
  return all
    .filter((o) => o.value > 0 || o.key === c.compType)
    .map((o) => ({ ...o, selected: o.key === c.compType }));
};

export const consignmentSummary = (c) => {
  const parts = [];
  if (parseFloat(c.listPrice) > 0) parts.push(`List ${money(c.listPrice)}`);
  const sel = compOptionsFor(c).find((o) => o.selected);
  if (sel) parts.push(sel.title);
  return parts.join(' • ');
};