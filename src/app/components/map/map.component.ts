import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
  computed
} from '@angular/core';
import { WfsService } from '../../services/wfs.service';
import { GeoFeatureCollection } from '../../interfaces/feature.interface';
import { GeoJSON } from 'ol/format';
import { Feature, Map, View } from 'ol';
import { Pixel } from 'ol/pixel';
import { Geometry } from 'ol/geom';
import TileLayer from 'ol/layer/Tile';
import { OSM } from 'ol/source';
import VectorLayer from 'ol/layer/Vector';
import { Circle, Fill, Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { FeatureLike } from 'ol/Feature';
import { PointsGeneratorComponent } from '../points-generator/points-generator.component';
import { RowsGeneratorComponent } from '../rows-generator/rows-generator.component';

@Component({
  selector: 'app-map',
  imports: [
    PointsGeneratorComponent,
    RowsGeneratorComponent
  ],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css'
})
export class MapComponent implements OnInit, AfterViewInit {
  wfsService = inject(WfsService);

  loading = signal(false);
  selectedFeature = signal<Feature | null>(null);
  selectedGeometry = signal<Geometry | null>(null);
  selectedGeometryType = computed(() => {
    const geometry = this.selectedGeometry();
    if (!geometry) {
      return null;
    }
    return { geometry, type: geometry.getType() };
  });

  mapElement = viewChild<ElementRef<HTMLElement>>('map');
  private map!: Map;
  protected helpVectorSource = new VectorSource();
  protected lineVectorSource = new VectorSource();
  protected polygonVectorSource = new VectorSource();
  private generatedPointsVectorSource = new VectorSource();

  get mapInstance() {
    return this.map;
  }

  ngOnInit() {
    this.loading.set(true)
    this.wfsService.getMockFeature().subscribe(response => {
      this.loadMockFeaturesToMap(response);
      this.loading.set(false);
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.map.on('singleclick', (event) => this.selectFeature(event.pixel));
  }

  private initMap(): void {
    this.map = new Map({
      target: this.mapElement()!.nativeElement,
      layers: [
        new TileLayer({
          source: new OSM()
        }),
        new VectorLayer({
          source: this.lineVectorSource,
          style: new Style({
            stroke: new Stroke({
              color: '#3399CC',
              width: 4,
            }),
          }),
          properties: {
            name: 'LinesVectorLayer',
          },
        }),
        new VectorLayer({
          source: this.polygonVectorSource,
          style: new Style({
            stroke: new Stroke({
              color: '#3399CC',
              width: 4,
            }),
          }),
          properties: {
            name: 'PolygonsVectorLayer',
          },
        }),
        new VectorLayer({
          source: this.helpVectorSource,
          style: (feature) => {
            const type = feature.get('type');

            switch (type) {
              case 'startLine':
                return new Style({
                  image: new Circle({
                    radius: 5,
                    fill: new Fill({color: '#21cc2e'}),
                  })
                });
              case 'endLine':
                return new Style({
                  image: new Circle({
                    radius: 5,
                    fill: new Fill({color: 'red'}),
                  })
                });
              default:
                return new Style();
            }
          },
          properties: {
            name: 'GenerateHelpLayer',
          }
        }),
        new VectorLayer({
          source: this.generatedPointsVectorSource,
          style: new Style({
            image: new Circle({
              radius: 3,
              fill: new Fill({color: 'yellow'}),
            }),
          }),
        })
      ],
      view: new View({
        center: fromLonLat([33.598321, 44.512136]),
        zoom: 15,
      })
    });
  }

  private loadMockFeaturesToMap(response: GeoFeatureCollection<'MultiPolygon' | 'Point' | 'LineString'>): void {
    const format = new GeoJSON();
    const features = format.readFeatures(response, {
      featureProjection: 'EPSG:3857',
    });

    const polygons = features.filter(f => {
      const type = f.getGeometry()?.getType();
      return type === 'Polygon' || type === 'MultiPolygon';
    });

    const lines = features.filter(f => f.getGeometry()?.getType() === 'LineString');

    this.polygonVectorSource.addFeatures(polygons);
    this.lineVectorSource.addFeatures(lines);

    if (features.length > 0) {
      this.zoomToFeature(features[0]);
    }
  }

  private zoomToFeature(feature: Feature): void {
    const geometry = feature.getGeometry();
    if (!geometry) return;

    this.map.getView().fit(geometry.getExtent(), {
      padding: [50, 50, 50, 50],
      maxZoom: 18,
      duration: 500,
    });
  }

  private selectFeatureByPixel(pixel: Pixel): FeatureLike {
    return this.map.forEachFeatureAtPixel(pixel, feature => feature)!
  }

  private selectFeature(pixel: Pixel) {
    this.selectedGeometry.set(null);
    this.selectedFeature.set(null);

    const featureLike = this.selectFeatureByPixel(pixel);

    if (!featureLike || !(featureLike instanceof Feature)) {
      return;
    }

    const geometry = featureLike.getGeometry();
    if (!(geometry instanceof Geometry)) {
      return;
    }

    const type = geometry.getType();

    if (type === 'LineString') {
      this.handleGeometrySelection(geometry, featureLike, 'Сгенерировать точки на линии?')
      return;
    } else if ((type === 'Polygon' || type === 'MultiPolygon')) {
      this.handleGeometrySelection(geometry, featureLike, 'Сгенерировать ряды внутри полигона?')
      return;
    }
  }

  private handleGeometrySelection(
    geometry: Geometry,
    feature: Feature,
    message: string
  ) {
    if (confirm(message)) {
      this.selectedGeometry.set(geometry);
      this.selectedFeature.set(feature);
    }
  }

}
