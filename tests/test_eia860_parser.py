import hashlib
import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("eia860_parser", ROOT / "scripts" / "parse-eia860m.py")
PARSER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PARSER)

HEADERS = [
    "Plant ID",
    "Generator ID",
    "Plant State",
    "Technology",
    "Net Summer Capacity (MW)",
    "Planned Operation Year",
    "Planned Operation Month",
    "Status",
]


def column_name(index):
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def write_fixture(path, data_rows, headers=HEADERS):
    values = ["Inventory of Planned Generators as of July 2026", *headers]
    for row in data_rows:
        values.extend(str(value) for value in row)
    unique = list(dict.fromkeys(values))
    index = {value: position for position, value in enumerate(unique)}
    shared = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + "".join(
        f"<si><t>{escape(value)}</t></si>" for value in unique
    ) + "</sst>"
    worksheet_rows = []
    all_rows = [[values[0]], headers, *data_rows]
    for row_number, row in enumerate(all_rows, 1):
        cells = "".join(
            f'<c r="{column_name(column)}{row_number}" t="s"><v>{index[str(value)]}</v></c>'
            for column, value in enumerate(row, 1)
        )
        worksheet_rows.append(f'<row r="{row_number}">{cells}</row>')
    worksheet = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(worksheet_rows) + "</sheetData></worksheet>"
    workbook = '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Planned" sheetId="1" r:id="rId1"/></sheets></workbook>'
    relationships = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>'
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("xl/sharedStrings.xml", shared)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", relationships)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)


class Eia860ParserTests(unittest.TestCase):
    def parse(self, rows, headers=HEADERS):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "fixture.xlsx"
        write_fixture(path, rows, headers)
        return PARSER.parse_workbook(path, "https://www.eia.gov/fixture.xlsx", "2026-09-06T00:00:00+00:00"), path

    def test_valid_workbook_preserves_dimensions_missing_count_and_provenance(self):
        snapshot, path = self.parse([
            ["100", "A1", "TX", "Batteries", "10.5", "2027", "7", "Under construction"],
            ["101", "B2", "VA", "Solar", "", "2028", "", "Planning"],
        ])
        self.assertEqual(snapshot["asOf"], "2026-07")
        self.assertEqual(snapshot["unit"], "MW net summer capacity")
        self.assertEqual(snapshot["missingCapacityCount"], 1)
        self.assertEqual(snapshot["retrievedAt"], "2026-09-06T00:00:00+00:00")
        self.assertEqual(snapshot["sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(snapshot["records"][0]["netSummerMW"], 10.5)
        self.assertIsNone(snapshot["records"][1]["month"])

    def test_missing_headers_duplicate_units_and_invalid_capacity_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Missing EIA headers"):
            self.parse([["100", "A1", "TX", "Batteries", "10", "2027", "7"]], HEADERS[:-1])
        with self.assertRaisesRegex(ValueError, "Duplicate planned unit"):
            self.parse([
                ["100", "A1", "TX", "Batteries", "10", "2027", "7", "Planning"],
                ["100", "A1", "TX", "Solar", "20", "2028", "8", "Planning"],
            ])
        with self.assertRaisesRegex(ValueError, "Invalid capacity"):
            self.parse([["100", "A1", "TX", "Batteries", "-1", "2027", "7", "Planning"]])

    def test_invalid_planned_calendar_dimensions_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Invalid planned month"):
            self.parse([["100", "A1", "TX", "Batteries", "10", "2027", "13", "Planning"]])
        with self.assertRaisesRegex(ValueError, "Invalid planned month"):
            self.parse([["100", "A1", "TX", "Batteries", "10", "2027", "July", "Planning"]])
        with self.assertRaisesRegex(ValueError, "Invalid planned year"):
            self.parse([["100", "A1", "TX", "Batteries", "10", "Twenty-seven", "7", "Planning"]])


if __name__ == "__main__":
    unittest.main()
