import React from 'react';
import type { ContactEngagement } from '../types';
import { categorizeEngagement, type EngagementLevel } from '../engagement';

export interface EngagementScoreCardProps {
  engagement: ContactEngagement;
  contactName?: string;
  contactEmail?: string;
}

const LEVEL_LABELS: Record<EngagementLevel, string> = {
  highly_engaged: 'Highly Engaged',
  engaged: 'Engaged',
  low_engagement: 'Low Engagement',
  inactive: 'Inactive',
};

export function EngagementScoreCard({
  engagement,
  contactName,
  contactEmail,
}: EngagementScoreCardProps) {
  const level = categorizeEngagement(engagement.engagementScore);

  return (
    <div className={`ec-engagement-card ec-engagement-card--${level.replace('_', '-')}`}>
      <div className="ec-engagement-card__header">
        {contactName && <h3 className="ec-engagement-card__name">{contactName}</h3>}
        {contactEmail && <span className="ec-engagement-card__email">{contactEmail}</span>}
      </div>

      <div className="ec-engagement-card__score-ring">
        <div className="ec-engagement-card__score-value">{engagement.engagementScore}</div>
        <div className="ec-engagement-card__score-label">Score</div>
      </div>

      <div className={`ec-engagement-card__level ec-engagement-card__level--${level.replace('_', '-')}`}>
        {LEVEL_LABELS[level]}
      </div>

      <div className="ec-engagement-card__stats">
        <div className="ec-engagement-card__stat">
          <span className="ec-engagement-card__stat-value">{engagement.totalOpens}</span>
          <span className="ec-engagement-card__stat-label">Opens</span>
        </div>
        <div className="ec-engagement-card__stat">
          <span className="ec-engagement-card__stat-value">{engagement.totalClicks}</span>
          <span className="ec-engagement-card__stat-label">Clicks</span>
        </div>
      </div>

      {(engagement.lastOpenAt || engagement.lastClickAt) && (
        <div className="ec-engagement-card__activity">
          {engagement.lastOpenAt && (
            <div className="ec-engagement-card__activity-item">
              Last open: {new Date(engagement.lastOpenAt).toLocaleDateString()}
            </div>
          )}
          {engagement.lastClickAt && (
            <div className="ec-engagement-card__activity-item">
              Last click: {new Date(engagement.lastClickAt).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
