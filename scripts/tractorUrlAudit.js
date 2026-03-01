const path = require('path');
require('module-alias')({ base: path.resolve(__dirname, '../api') });

(async () => {
  const Tool = require('../api/app/clients/tools/structured/WoodlandAISearchTractor');
  const t = new Tool({});

  const raw = await t._call({
    query: 'John Deere Z915E 60',
    make: 'John Deere',
    model: 'Z915E',
    deck_size: '60',
    top: 15,
  });

  const data = JSON.parse(raw);
  const target = 'https://www.cyclonerake.com/';
  const rawDocs = Array.isArray(data.raw_docs) ? data.raw_docs : [];

  const hits = rawDocs
    .map((d, idx) => {
      const n = d?.normalized_compat || {};
      const fields = [
        ['oem.mda_url', n?.oem?.mda_url],
        ['oem.hitch_url', n?.oem?.hitch_url],
        ['oem.hose_url', n?.oem?.hose_url],
        ['oem.upgrade_hose_url', n?.oem?.upgrade_hose_url],
        ['oem.rubber_collar_url', n?.oem?.rubber_collar_url],
        ['aftermarket.mda_url', n?.aftermarket?.mda_url],
        ['aftermarket.hitch_url', n?.aftermarket?.hitch_url],
        ['aftermarket.hose_url', n?.aftermarket?.hose_url],
        ['aftermarket.upgrade_hose_url', n?.aftermarket?.upgrade_hose_url],
      ];

      const matched = fields.filter(([, v]) => v === target);
      if (matched.length === 0) return null;

      return {
        idx,
        id: d?.id,
        title: d?.title,
        kit_or_assembly: n?.kit_or_assembly,
        matched_fields: matched,
        agent_grouped_table: (data.grouped_tables || [])[idx] || null,
        agent_support_answer: (data.support_answers || [])[idx] || null,
      };
    })
    .filter(Boolean);

  console.log(
    JSON.stringify(
      {
        target_url: target,
        total_docs: data.docs?.length || 0,
        hit_count: hits.length,
        hits,
      },
      null,
      2,
    ),
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
