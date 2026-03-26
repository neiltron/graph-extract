export interface ExtractedEntity {
  text: string;
  type: string;
  mention?: string;
}

export interface ExtractedRelationship {
  source: string;
  target: string;
  type: string;
  mention?: string;
}

export interface EntityExtraction {
  entities: ExtractedEntity[];
}

export interface RelationshipExtraction {
  relationships: ExtractedRelationship[];
}
