import { Directive, TemplateRef, ViewContainerRef, input, effect } from '@angular/core';
import { Loading } from './loading';

@Directive({
  selector: '[peaLoading]'
})
export class LoadingDirective {
  readonly peaLoading = input(false); // signal-based input

  constructor(private templateRef: TemplateRef<any>, private viewContainer: ViewContainerRef) {
    effect(() => {
      this.update();
    });
  }

  private update() {
    this.viewContainer.clear();
    if (!this.peaLoading()) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.createComponent(Loading);
    }
  }
}
