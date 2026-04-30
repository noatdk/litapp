import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams, PopoverController } from 'ionic-angular';

import { Story } from '../../models/story';
import { Stories, Memos } from '../../providers/providers';

@IonicPage()
@Component({
  selector: 'page-story-series',
  templateUrl: 'story-series.html',
})
export class StorySeriesPage {
  series: Story[];
  seriesId: number;

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    public stories: Stories,
    public memos: Memos,
    private popoverCtrl: PopoverController,
  ) {
    const story: Story = navParams.get('story');
    this.seriesId = story.series;
    this.stories.getSeries(story.series).subscribe(data => {
      this.series = data[0];
    });
  }

  openSeriesMemo(ev: UIEvent) {
    const popover = this.popoverCtrl.create('MemoPopover', {
      kind: 'series',
      id: this.seriesId,
    });
    popover.present({ ev });
  }

  download() {
    this.stories.downloadSeries(this.series);
  }
}
