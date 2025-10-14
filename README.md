# life-manager

## How to run

```bash
cargo run
```

## Example API calls

```bash
curl --location 'http://127.0.0.1:3000/documents/1'
curl -X POST -H "Content-Type: multipart/form-data" -F "json={\"id\": 99, \"title\":\"MYTEST\",\"content\":\"this is an example\"}" -F "file=@README.md" localhost:3000/documents
```


## Installation

### Diesel

See this tutorial: https://diesel.rs/guides/getting-started

Install the Diesel command-line interface for PostgreSQL:

```bash
cargo install diesel_cli --no-default-features --features postgres
```

Run migrations:

```bash
diesel migration run
```

## Planned Features

#### Document Manager
* Store documents and associate them with family members
* Automate reminders to alert users before documents expire

### Medical Manager
* Diary of doctor visits
* Track personal health data (height, weight, etc) over time and visualize with charts

### Location Manager
* Integrate with Google's "find my device" feature to show location of everyone on a map

### Car Manager
* Diary of mechanic visits and history

### Receipt Manager
* Upload and store receipts. Possibly parsing info such as vendor name, date, and amount from
the receipt image

```mermaid
---
title: Aggregates, Entities and Value Objects
---

flowchart TD

  M-->Did
  D-->Mid
  D-->A

    M[Member]
    D[Document]
    Mid[MemberId]
    Did[DocumentId]
    A[Alert]
```
