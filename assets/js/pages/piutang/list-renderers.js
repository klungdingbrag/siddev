// Markup-only renderers for the receivables table row and mobile card.

export function renderPiutangRow(r, helpers) {
  const { collectionPriorityMeta, esc, formatMoney } = helpers;
  const meta = collectionPriorityMeta(r);
  return '<tr><td><div class="customer-cell"><strong>' + esc(r.nm_pelanggan || r.kd_pelanggan) + '</strong><span>' + esc(r.kd_pelanggan) + '</span></div></td>' +
    '<td>' + formatMoney(r.belum_jatuh_tempo) + '</td><td>' + formatMoney(r.aging_1_30) + '</td><td>' + formatMoney(r.aging_31_60) + '</td><td>' + formatMoney(r.aging_61_90) + '</td><td>' + formatMoney(r.aging_91_120) + '</td><td>' + formatMoney(r.aging_121_plus) + '</td><td><strong>' + formatMoney(r.total_piutang) + '</strong></td><td><div class="collection-priority-info"><span class="collection-priority-badge priority-badge-' + meta.priority + '">' + meta.label + '</span><span class="collection-priority-age">' + esc(meta.ageLabel) + '</span><span class="collection-priority-context">' + esc(meta.totalLabel + " · " + meta.notesLabel) + '</span></div></td><td><button class="icon-btn detail-trigger" data-code="' + esc(r.kd_pelanggan) + '">Detail</button></td></tr>';
}

export function renderPiutangCard(r, helpers) {
  const { collectionPriorityMeta, esc, formatMoney } = helpers;
  const meta = collectionPriorityMeta(r);
  return '<article class="mobile-customer-card"><div class="mobile-customer-head"><div><strong>' + esc(r.nm_pelanggan || r.kd_pelanggan) + '</strong><span>' + esc(r.kd_pelanggan) + '</span></div><button class="icon-btn detail-trigger" data-code="' + esc(r.kd_pelanggan) + '">Detail</button></div><div class="mobile-collection-info"><span class="collection-priority-badge priority-badge-' + meta.priority + '">' + meta.label + '</span><strong>' + esc(meta.ageLabel) + '</strong><small>' + esc(meta.totalLabel + " · " + meta.notesLabel) + '</small></div><div class="mobile-customer-total"><span>Total Piutang</span><strong>' + formatMoney(r.total_piutang) + '</strong></div><div class="mobile-aging-grid">' +
    '<span>Belum tempo <b>' + formatMoney(r.belum_jatuh_tempo) + '</b></span><span>1–30 <b>' + formatMoney(r.aging_1_30) + '</b></span><span>31–60 <b>' + formatMoney(r.aging_31_60) + '</b></span><span>61–90 <b>' + formatMoney(r.aging_61_90) + '</b></span><span>91–120 <b>' + formatMoney(r.aging_91_120) + '</b></span><span>≥121 <b>' + formatMoney(r.aging_121_plus) + '</b></span></div></article>';
}

