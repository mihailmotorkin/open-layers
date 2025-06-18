import { ComponentRef, Injectable, Type, ViewContainerRef } from '@angular/core';
import { GeometryType } from '../../../interfaces/feature.interface';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  #container!: ViewContainerRef;

  registerComponent(vcr: ViewContainerRef) {
    this.#container = vcr;
  }

  showModal<T>(component: Type<T>, data: GeometryType): ComponentRef<T> | null {
    if (!this.#container) { return null; }

    this.#container.clear();
    const componentRef = this.#container.createComponent(component);

    if(componentRef && data) componentRef.setInput('type', data);

    return componentRef ?? null;
  }

  destroyModal() {
    if (!this.#container) return;
    this.#container.clear();
  }
}
