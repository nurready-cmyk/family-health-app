"""Repository pattern layer.

Every read/write to the underlying storage (Google Sheets today, PostgreSQL
tomorrow) goes through the repository interfaces defined in this package.
Nothing outside database/ should import gspread, a worksheet object, or a
raw row/cell reference directly.
"""

