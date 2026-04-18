import json

with open("seating_plans.json", "r") as f:
    data = json.load(f)

for plan in data["results"]:
    if plan["id"] == 5391:
        for zone in plan["layout"]["zones"]:
            if zone["name"] == "SALA NICCOLINI":
                for row in zone["rows"]:
                    if row["row_number"] == "A":
                        for seat in row["seats"]:
                            if seat["seat_number"] == "4":
                                seat["seat_guid"] = "FA4"
                            elif seat["seat_number"] == "5":
                                seat["seat_guid"] = "FA5"
                            elif seat["seat_number"] == "6":
                                seat["seat_guid"] = "FA6"

with open("seating_plans.json", "w") as f:
    json.dump(data, f, separators=(',', ':'))

