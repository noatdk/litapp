import { Component } from '@angular/core';
import { IonicPage, NavController, NavParams } from 'ionic-angular';

import { Story } from '../../models/story';
import { Stories } from '../../providers/providers';

@IonicPage({ segment: 'series/:seriesId' })
@Component({
  selector: 'page-story-series',
  templateUrl: 'story-series.html',
})
export class StorySeriesPage {
  series: Story[];
  seriesId: number;

  constructor(public navCtrl: NavController, public navParams: NavParams, public stories: Stories) {
    const story: Story = navParams.get('story');
    const sidParam = navParams.get('seriesId');
    this.seriesId = sidParam != null ? parseInt(String(sidParam), 10) : story && story.series;
    this.stories.getSeries(this.seriesId).subscribe(data => {
      this.series = data[0];
    });
  }

  download() {
    this.stories.downloadSeries(this.series);
  }
}
