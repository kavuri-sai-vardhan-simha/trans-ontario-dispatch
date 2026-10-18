# Live pickup assignment — diagrams (current design)
**The one rule:** a truck takes a new pickup only if it has room at that moment, can reach it before the service cutoff, and every other customer stays on time. The dispatcher always decides.

## 1. The big picture

Orders keep coming the way they do today. Nothing is typed twice.

```mermaid
flowchart LR
  C["Customer<br/>phone / email / Web Dispatch"] --> EL["Elite<br/>(office staff enter the order)"]
  EL -->|new order| B
  subgraph B["Our layer"]
    direction TB
    S["Live truck state<br/>where · on board · stops left · hours"]
    E["3 checks on every truck<br/>+ ranking (regulars first)"]
    S --> E
  end
  E -->|"New orders received (count + alert)<br/>top trucks + reasons, warnings"| D["Dispatcher"]
  D -->|one click: Assign| EL
  EL -->|"as today"| DR["Samsara Driver"]
  DR -->|"OK, or ask to decline + reason"| D
  DR -->|GPS, stop done, free spots| S
```

## 2. Can this truck take the pickup?

```mermaid
flowchart TD
  A(["New order in Elite"]) --> T{"Right equipment,<br/>licence, hours left?"}
  T -- no --> X1["Skip truck"]
  T -- yes --> P["Try each slot in its<br/>remaining stops"]
  P --> Q1{"1. Room until the depot<br/>(or the same-day drop)?"}
  Q1 -- no --> NX["Next slot"]
  Q1 -- yes --> Q2{"2. Reaches it before the<br/>service cutoff?<br/>Rush 3:30 · Out of town 1:30 · others 5 pm"}
  Q2 -- no --> NX
  Q2 -- yes --> Q3{"3. Every other stop on time,<br/>driver within 14 h?"}
  Q3 -- no --> NX
  Q3 -- yes --> OK["Works: note extra km,<br/>extra minutes, pickup time"]
  NX --> P
  OK --> R["Rank: on time, customer wait<br/>(regular 1.5 · occasional 1.2 · new 1.0),<br/>extra time, extra km<br/>Cost $ only if the toggle is on"]
  R --> F{"Any truck?"}
  F -- yes --> TOP["Top trucks to dispatcher,<br/>+ warning if a regular nearby<br/>needs the same room"]
  F -- no --> ALT["Ruled-out list with reasons"]
```

## 3. One order, start to finish

```mermaid
sequenceDiagram
  autonumber
  participant Cu as Customer
  participant El as Elite (staff)
  participant L as Our layer
  participant Di as Dispatcher
  participant Dr as Samsara Driver
  Cu->>El: Phone / email order
  El->>L: New order (regular or new found from the account)
  L-->>Di: New orders received (1) + top trucks
  Di->>El: Assign Truck 218
  El->>Dr: Stop added to the route
  alt Driver is fine
    Dr->>L: OK, got it
  else Driver can't
    Dr->>L: Ask to decline + reason
    L-->>Di: Decline request
    alt Dispatcher approves
      Di->>L: Approve: back to waiting, next best truck
    else Dispatcher keeps it
      Di->>Dr: Keep it, with a note
    end
  end
  Dr->>L: Picked up (GPS done-mark)
```

## 4. Driver called in sick

```mermaid
flowchart LR
  S(["Driver: I'm unwell"]) --> D["Dispatcher: 3 options"]
  D --> O1["Spare driver takes the same truck<br/>(driver 176, AZ, off that day)"]
  D --> O2["Share the work: rescue truck<br/>+ pickups to other trucks (3 checks)"]
  D --> O3["Partner carrier for far stops"]
```

## 5. Life of an order

```mermaid
stateDiagram-v2
  [*] --> NewInElite
  NewInElite --> Waiting: dispatcher opened it
  Waiting --> Assigned: dispatcher assigns
  Assigned --> DeclineRequested: driver asks, with reason
  DeclineRequested --> Waiting: dispatcher approves
  DeclineRequested --> Assigned: dispatcher keeps it
  Assigned --> PickedUp: GPS done-mark
  PickedUp --> Delivered: same day, or via depot next day
  Delivered --> [*]
```

## 6. Next
Real road distances and traffic · customer email updates · AI photo → free floor spots (in development) · live Elite and Samsara connection.
