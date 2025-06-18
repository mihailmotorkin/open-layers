import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'svg[icon]',
  imports: [],
  template: '<svg:use [attr.href]="href()"></svg:use>',
  styleUrl: './svg-icon.component.css'
})
export class SvgIconComponent {
  icon = input<string>('');
  href = computed(() => `/assets/svg/${this.icon()}.svg#${this.icon()}`);
}
