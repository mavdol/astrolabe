# order-importer

Imports the nightly orders export into the warehouse. `npm run import` parses `data/orders.csv` and prints the order count and revenue.

The CSV parser is `csv-simple`, vendored in `vendor/`.
