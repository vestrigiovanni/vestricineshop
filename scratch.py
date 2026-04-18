import json

with open("seating_plans.json", "r") as f:
    data = json.load(f)

for plan in data["results"]:
    if plan["id"] == 5391:
        print(f"Found plan 5391: {plan['name']}")
        for zone in plan["layout"]["zones"]:
            print(f"- zone: {zone['name']}")
            for row in zone["rows"]:
                print(f"  - row: {row['row_number']}")
                for seat in row["seats"]:
                    print(f"    - seat: {seat['seat_number']}, guid: {seat['seat_guid']}, area: {seat.get('category')}")

