import json

with open('cdp_final.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

matched = [feat for feat in data['features'] 
           if feat['properties'].get('Foreign Born - Total Pop') is not None 
           and feat['properties'].get('Foreign Born - Total Pop') != None]

print(f'Features with demographic data: {len(matched)}')
if matched:
    sample = matched[0]
    props = sample['properties']
    print(f'\nSample matched feature: {props.get("NAMELSAD")}')
    print(f'  Population: {props.get("Population")}')
    print(f'  Foreign Born: {props.get("Foreign Born - Total Pop")}')
    print(f'  Latino: {props.get("Latino")}')
    print(f'  White: {props.get("White")}')
    print(f'  Black: {props.get("Black")}')
    print(f'  Asian: {props.get("Asian")}')

