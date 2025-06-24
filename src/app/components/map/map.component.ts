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
import { GeoFeatureCollection, GeometryType } from '../../interfaces/feature.interface';
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
import { ModalInteractionComponent } from '../modal-intaraction/modal-interaction.component';
import { ModalService } from '../../сommon-ui/modal-feature/services/modal.service';

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
  #modalService = inject(ModalService);

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
  generatedPointsVectorSource = new VectorSource();

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

  ngAfterViewInit() {
    this.initMap();
    this.map.on('singleclick', (event) => this.selectFeature(event.pixel));
  }

  private initMap() {
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
              radius: 5,
              fill: new Fill({color: 'yellow'}),
            }),
          }),
          zIndex: 10
        })
      ],
      view: new View({
        center: fromLonLat([33.598321, 44.512136]),
        zoom: 15,
      })
    });
  }

  private loadMockFeaturesToMap(response: GeoFeatureCollection<GeometryType>): void {
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

    const type = geometry.getType() as GeometryType;

    this.toggleModal(type, geometry, featureLike);
  }

  private toggleModal(
    type: GeometryType,
    geometry: Geometry,
    feature: Feature
  ) {
    const modalRef = this.#modalService.showModal(ModalInteractionComponent, type);

    this.selectedFeature.set(feature);

    modalRef?.instance.closed.subscribe((event: 'generate' | 'delete' | 'cancel') => {
      if (event === 'generate') {
        this.selectedGeometry.set(geometry);
      } else if (event === 'delete') {
        this.deleteFeature(feature);
      } else {
        this.selectedGeometry.set(null);
      }
      this.#modalService.destroyModal();
    });
  }

  private deleteFeature(feature: Feature) {
    if (!this.mapInstance) return;

    if (feature.get('pointId')) {
      this.generatedPointsVectorSource.removeFeature(feature);
      return;
    }

    const lineId = feature.getId();
    const points = this.generatedPointsVectorSource.getFeatures();
    const pointsToRemove = points.filter(p => p.get('parentLineId') === lineId);
    this.generatedPointsVectorSource.removeFeatures(pointsToRemove);

    const layers = this.mapInstance.getLayers().getArray();
    for (const layer of layers) {
      if (!(layer instanceof VectorLayer)) continue;

      const source = layer.getSource();
      if (source.getFeatures().includes(feature)) {
        source.removeFeature(feature);
        if (source.getFeatures().length === 0) {
          this.mapInstance.removeLayer(layer);
        }
      }
    }
  }

}
