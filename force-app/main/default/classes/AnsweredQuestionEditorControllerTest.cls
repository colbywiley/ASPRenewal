@isTest
private class AnsweredQuestionEditorControllerTest {

    @TestSetup
    static void setupTestData() {
        TREX1__Custom_Question__c cqWithOptions = new TREX1__Custom_Question__c(
            TREX1__Question_Text__c = 'Favorite Color',
            TREX1__Data_Type__c = 'Picklist',
            TREX1__Picklist_Allowed_Answers__c = 'Red;Blue;Green;Yellow',
            TREX1__Required__c = true
        );
        insert cqWithOptions;

        TREX1__Custom_Question__c cqWithoutOptions = new TREX1__Custom_Question__c(
            TREX1__Question_Text__c = 'Your Name',
            TREX1__Data_Type__c = 'Text',
            TREX1__Required__c = false
        );
        insert cqWithoutOptions;
    }

    @isTest
    static void testGetCustomQuestionInfo_WithValidIds() {
        TREX1__Custom_Question__c cqWithOptions = [
            SELECT Id FROM TREX1__Custom_Question__c WHERE TREX1__Question_Text__c = 'Favorite Color' LIMIT 1
        ];
        TREX1__Custom_Question__c cqWithoutOptions = [
            SELECT Id FROM TREX1__Custom_Question__c WHERE TREX1__Question_Text__c = 'Your Name' LIMIT 1
        ];

        List<Id> cqIds = new List<Id>{ cqWithOptions.Id, cqWithoutOptions.Id };

        Test.startTest();
        Map<Id, AnsweredQuestionEditorController.CustomQuestionInfo> result =
            AnsweredQuestionEditorController.getCustomQuestionInfo(cqIds);
        Test.stopTest();

        System.assertEquals(2, result.size(), 'Should return info for both records');

        AnsweredQuestionEditorController.CustomQuestionInfo infoWithOptions = result.get(cqWithOptions.Id);
        System.assertNotEquals(null, infoWithOptions, 'Should contain the Custom Question with options');
        System.assertEquals('Red;Blue;Green;Yellow', infoWithOptions.picklistOptions);
        System.assertEquals(true, infoWithOptions.required);

        AnsweredQuestionEditorController.CustomQuestionInfo infoWithoutOptions = result.get(cqWithoutOptions.Id);
        System.assertNotEquals(null, infoWithoutOptions, 'Should contain the Custom Question without options');
        System.assertEquals(null, infoWithoutOptions.picklistOptions);
        System.assertEquals(false, infoWithoutOptions.required);
    }

    @isTest
    static void testGetCustomQuestionInfo_WithEmptyList() {
        Test.startTest();
        Map<Id, AnsweredQuestionEditorController.CustomQuestionInfo> result =
            AnsweredQuestionEditorController.getCustomQuestionInfo(new List<Id>());
        Test.stopTest();

        System.assertEquals(0, result.size(), 'Should return empty map for empty input');
    }

    @isTest
    static void testGetCustomQuestionInfo_WithNull() {
        Test.startTest();
        Map<Id, AnsweredQuestionEditorController.CustomQuestionInfo> result =
            AnsweredQuestionEditorController.getCustomQuestionInfo(null);
        Test.stopTest();

        System.assertEquals(0, result.size(), 'Should return empty map for null input');
    }
}