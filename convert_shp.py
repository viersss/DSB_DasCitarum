import geopandas as gpd
import pandas as pd
import json
import sys

# Read the shapefile that has 290 features
d = 'C:/Users/viery/Downloads/DAS_Citarum_Extracted'
shps = ['dissolved_threshold_200k.shp']  # Known to have 290 features

for s in shps:
    gdf = gpd.read_file(f'{d}/{s}')
    
    # Reproject from EPSG:32748 (UTM 48S) to EPSG:4326 (WGS84 lat/lon)
    gdf = gdf.to_crs(epsg=4326)
    
    # The 'value' column in GeoJSON matches 'fid' in Excel
    # Rename 'value' to 'SubDAS_ID' for dashboard compatibility
    gdf['SubDAS_ID'] = gdf['value']
    
    # Simplify geometry to reduce file size (tolerance in degrees, ~50m)
    gdf['geometry'] = gdf['geometry'].simplify(tolerance=0.0005, preserve_topology=True)
    
    # Output as GeoJSON to stdout
    geojson_str = gdf.to_json()
    
    # Remove the CRS property that geopandas adds (Leaflet assumes WGS84)
    geojson_obj = json.loads(geojson_str)
    if 'crs' in geojson_obj:
        del geojson_obj['crs']
    
    print(json.dumps(geojson_obj))
