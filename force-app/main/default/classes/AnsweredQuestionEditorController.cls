public without sharing class AnsweredQuestionEditorController {

    @AuraEnabled(cacheable=true)
    public static Map<Id, CustomQuestionInfo> getCustomQuestionInfo(List<Id> customQuestionIds) {
        Map<Id, CustomQuestionInfo> infoMap = new Map<Id, CustomQuestionInfo>();

        if (customQuestionIds == null || customQuestionIds.isEmpty()) {
            return infoMap;
        }

        for (TREX1__Custom_Question__c cq : [
            SELECT Id, TREX1__Picklist_Allowed_Answers__c, TREX1__Required__c
            FROM TREX1__Custom_Question__c
            WHERE Id IN :customQuestionIds
        ]) {
            CustomQuestionInfo info = new CustomQuestionInfo();
            info.picklistOptions = cq.TREX1__Picklist_Allowed_Answers__c;
            info.required = cq.TREX1__Required__c == true;
            infoMap.put(cq.Id, info);
        }

        return infoMap;
    }

    public class CustomQuestionInfo {
        @AuraEnabled public String picklistOptions;
        @AuraEnabled public Boolean required;
    }
}