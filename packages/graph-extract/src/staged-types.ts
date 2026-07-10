export interface ExtractedEntity {
  id?: string;
  text: string;
  type: string;
  mention?: string;
}

export interface CatalogEntity {
  id: string;
  text: string;
  type: string;
  mention?: string;
}

export interface RelationTypeDefinition {
  name: string;
  description?: string;
  /** Entity types allowed as the edge source; omit for any. */
  sourceTypes?: string[];
  /** Entity types allowed as the edge target; omit for any. */
  targetTypes?: string[];
}

export interface RelationshipSnippet {
  id: string;
  text: string;
  entityIds: string[];
}

export interface ExtractedRelationship {
  sourceId?: string;
  targetId?: string;
  source?: string;
  target?: string;
  type: string;
  mention?: string;
  snippetId?: string;
}

export interface EntityExtraction {
  entities: ExtractedEntity[];
}

export interface RelationSchemaExtraction {
  relationTypes: RelationTypeDefinition[];
}

export interface RelationshipExtraction {
  relationships: ExtractedRelationship[];
}
