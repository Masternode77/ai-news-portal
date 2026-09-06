"""Parse EIA-860M Planned worksheet using only the Python standard library."""
import argparse, datetime, hashlib, json, math, re, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def parse_workbook(path, source_url, retrieved_at):
    raw = Path(path).read_bytes()
    with zipfile.ZipFile(path) as z:
        strings = [''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        workbook = ET.fromstring(z.read('xl/workbook.xml'))
        sheet = next(s for s in workbook.find('m:sheets', NS) if s.attrib['name'] == 'Planned')
        rel_id = sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        relations = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        target = next(r.attrib['Target'] for r in relations if r.attrib['Id'] == rel_id)
        xml = ET.fromstring(z.read('xl/' + target.lstrip('/').removeprefix('xl/')))
        rows = []
        for row in xml.findall('m:sheetData/m:row', NS):
            result = {}
            for cell in row:
                value = cell.find('m:v', NS)
                text = value.text if value is not None else ''
                if cell.attrib.get('t') == 's' and text: text = strings[int(text)]
                if cell.attrib.get('t') == 'inlineStr': text = ''.join(cell.find('m:is', NS).itertext())
                result[re.sub(r'\d', '', cell.attrib['r'])] = text
            rows.append(result)
    heading = next((r.get('A', '') for r in rows if 'Inventory of Planned Generators as of' in r.get('A', '')), '')
    as_of = datetime.datetime.strptime(heading.split('as of ')[1], '%B %Y').strftime('%Y-%m')
    headers = next(r for r in rows if 'Net Summer Capacity (MW)' in r.values())
    columns = {v: k for k, v in headers.items()}
    required = ['Plant ID', 'Generator ID', 'Plant State', 'Technology', 'Net Summer Capacity (MW)', 'Planned Operation Year', 'Planned Operation Month', 'Status']
    if not all(name in columns for name in required): raise ValueError('Missing EIA headers')
    records, seen, missing = [], set(), 0
    for row in rows:
        def get(name): return row.get(columns[name], '').strip()
        if not get('Plant ID').isdigit(): continue
        ident = (get('Plant ID'), get('Generator ID'))
        if ident in seen: raise ValueError('Duplicate planned unit')
        seen.add(ident)
        value = get('Net Summer Capacity (MW)')
        capacity = float(value) if value else None
        if capacity is not None and (capacity < 0 or not math.isfinite(capacity)): raise ValueError('Invalid capacity')
        if capacity is None: missing += 1
        year, month = get('Planned Operation Year'), get('Planned Operation Month')
        if month and (not month.isdigit() or not 1 <= int(month) <= 12): raise ValueError('Invalid planned month')
        if year and (not year.isdigit() or not 1900 <= int(year) <= 2200): raise ValueError('Invalid planned year')
        records.append({'plantId': ident[0], 'generatorId': ident[1], 'state': get('Plant State'), 'technology': get('Technology'), 'netSummerMW': capacity, 'year': int(year) if year.isdigit() else None, 'month': int(month) if month.isdigit() else None, 'status': get('Status')})
    if not records: raise ValueError('No planned units')
    return {'dataset': 'EIA-860M planned generating and storage units', 'asOf': as_of, 'retrievedAt': retrieved_at, 'sourceUrl': source_url, 'sha256': hashlib.sha256(raw).hexdigest(), 'unit': 'MW net summer capacity', 'missingCapacityCount': missing, 'records': records}

if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('workbook'); cli.add_argument('--source-url', required=True); cli.add_argument('--output', required=True)
    args = cli.parse_args()
    snapshot = parse_workbook(args.workbook, args.source_url, datetime.datetime.now(datetime.timezone.utc).isoformat())
    Path(args.output).write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"Validated {len(snapshot['records'])} planned units; {snapshot['missingCapacityCount']} missing capacities")
